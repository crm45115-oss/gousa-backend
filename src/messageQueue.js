const crypto = require('crypto');
const { config } = require('./env');

let Queue = null;
let Worker = null;
let QueueEvents = null;
let IORedis = null;
try {
  ({ Queue, Worker, QueueEvents } = require('bullmq'));
  IORedis = require('ioredis');
} catch (error) {
  // Si Railway todavía no instaló dependencias, el backend no debe caerse.
  console.warn('[QUEUE_DISABLED_DEPENDENCIES]', error.message);
}

let queue = null;
let worker = null;
let queueEvents = null;
let connection = null;
let workerStarted = false;

function queueAvailable() {
  return Boolean(config.queueEnabled && config.redisUrl && Queue && Worker && IORedis);
}

function getConnection() {
  if (!queueAvailable()) return null;
  if (!connection) {
    connection = new IORedis(config.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    });
    connection.on('error', (err) => console.error('[REDIS_ERROR]', err.message));
  }
  return connection;
}

function getQueue() {
  if (!queueAvailable()) return null;
  if (!queue) {
    queue = new Queue(config.queueName, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: config.messageRetryLimit,
        backoff: { type: 'exponential', delay: config.messageRetryDelayMs },
        removeOnComplete: config.queueRemoveOnComplete,
        removeOnFail: config.queueRemoveOnFail
      }
    });
  }
  return queue;
}

function stableHash(value) {
  return crypto.createHash('sha1').update(JSON.stringify(value || {})).digest('hex');
}

function collectMetaIds(payload = {}) {
  const ids = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      for (const msg of value.messages || []) if (msg?.id) ids.push(msg.id);
      for (const status of value.statuses || []) if (status?.id) ids.push(`status:${status.id}:${status.status || ''}`);
    }
  }
  return ids;
}

function collectEvolutionIds(payload = {}) {
  const ids = [];
  const data = payload.data || payload.message || payload.messages || payload;
  const items = Array.isArray(data) ? data : [data];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const key = item.key || item.message?.key || {};
    const id = key.id || item.id || item.messageId || item.message_id;
    const remote = key.remoteJid || item.remoteJid || item.sender || item.from || item.chatId || '';
    if (id) ids.push(`${remote}:${id}`);
  }
  if (payload.event) ids.push(`event:${payload.instance || payload.instanceName || ''}:${payload.event}:${payload.data?.state || ''}`);
  return ids;
}

function getWebhookJobId(provider, payload = {}) {
  const ids = provider === 'evolution' ? collectEvolutionIds(payload) : collectMetaIds(payload);
  if (ids.length) return `${provider}:${ids.sort().join('|')}`.slice(0, 250);
  return `${provider}:payload:${stableHash(payload)}`;
}

async function enqueueWebhookJob({ provider, payload }) {
  const q = getQueue();
  if (!q) return { queued: false, reason: 'queue_disabled' };
  const jobId = getWebhookJobId(provider, payload);
  const job = await q.add('webhook-message', { provider, payload, receivedAt: new Date().toISOString() }, { jobId });
  return { queued: true, jobId: job.id, name: job.name };
}

async function processQueuedWebhook(job) {
  const { provider, payload } = job.data || {};
  const { processWebhookPayload, processEvolutionWebhookPayload } = require('./processor');
  if (provider === 'evolution') {
    const result = await processEvolutionWebhookPayload(payload);
    console.log('[QUEUE_EVOLUTION_PROCESSED]', JSON.stringify({ jobId: job.id, result }));
    return result;
  }
  const result = await processWebhookPayload(payload);
  console.log('[QUEUE_META_PROCESSED]', JSON.stringify({ jobId: job.id, result }));
  return result;
}

function startQueueWorker() {
  if (!queueAvailable()) {
    console.log('[QUEUE_DISABLED]', JSON.stringify({ queueEnabled: config.queueEnabled, hasRedisUrl: Boolean(config.redisUrl), hasDeps: Boolean(Queue && Worker && IORedis) }));
    return null;
  }
  if (workerStarted) return worker;
  workerStarted = true;

  getQueue();
  queueEvents = new QueueEvents(config.queueName, { connection: getConnection() });
  queueEvents.on('failed', ({ jobId, failedReason }) => console.error('[QUEUE_JOB_FAILED]', { jobId, failedReason }));
  queueEvents.on('completed', ({ jobId }) => console.log('[QUEUE_JOB_COMPLETED]', { jobId }));

  worker = new Worker(config.queueName, processQueuedWebhook, {
    connection: getConnection(),
    concurrency: config.queueConcurrency
  });
  worker.on('failed', (job, err) => console.error('[QUEUE_WORKER_FAILED]', { jobId: job?.id, error: err.message }));
  worker.on('error', (err) => console.error('[QUEUE_WORKER_ERROR]', err.message));

  console.log('[QUEUE_WORKER_STARTED]', JSON.stringify({ queue: config.queueName, concurrency: config.queueConcurrency }));
  return worker;
}

async function getQueueStatus() {
  const q = getQueue();
  if (!q) return { enabled: false, reason: config.redisUrl ? 'dependencies_missing_or_disabled' : 'REDIS_URL_missing' };
  const counts = await q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed', 'paused');
  return { enabled: true, queue: config.queueName, concurrency: config.queueConcurrency, counts };
}

async function closeQueue() {
  await Promise.allSettled([
    worker?.close(),
    queueEvents?.close(),
    queue?.close(),
    connection?.quit()
  ]);
}

module.exports = {
  queueAvailable,
  enqueueWebhookJob,
  startQueueWorker,
  getQueueStatus,
  closeQueue
};
