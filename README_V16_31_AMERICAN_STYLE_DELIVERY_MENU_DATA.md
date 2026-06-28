# ChatFlow360 V16.31 - Backend

Cambios:
- Cuando American Style detecta delivery, otra plaza, departamento/provincia o recojo, registra el tipo en `live_fardo_pedidos`.
- Nueva clasificación `delivery_plaza` para cualquier plaza distinta a Plaza El Trompillo.
- Si el cliente está en estado esperando datos de delivery/departamento, el siguiente mensaje se guarda como datos recolectados.
- No cambia Evolution, Redis ni configuración actual.

Variables nuevas: ninguna.
SQL recomendado: SQL_V16_31_AMERICAN_STYLE_DELIVERY_MENU_DATA.sql
