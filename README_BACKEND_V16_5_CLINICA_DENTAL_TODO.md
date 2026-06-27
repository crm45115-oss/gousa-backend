# Backend V16.5 Clínica Dental - pendiente Railway

Esta entrega NO toca Railway. Para agenda automática real por WhatsApp, el backend debe:

1. Detectar empresa por phone_number_id.
2. Leer empresas.rubro.
3. Si rubro = clinica_dental, usar herramientas:
   - buscar_horarios_disponibles_clinica(empresa_id, profesional_id, fecha)
   - crear_cita_clinica_segura(...)
4. Pedir nombre, teléfono, motivo, dolor, doctor/especialidad y fecha/hora.
5. No inventar disponibilidad.
6. Guardar cita en citas_clinicas.
7. Responder confirmación por WhatsApp.

Este archivo es guía para la siguiente versión de backend.
