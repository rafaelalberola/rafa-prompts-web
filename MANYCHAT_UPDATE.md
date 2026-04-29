# Manychat: URLs a actualizar (manual)

Manychat no permite actualizar flows vía API pública. Entra al editor de Manychat y actualiza estos enlaces en los flows correspondientes.

## Flow LUNA (renombrado desde YATE — keyword cambió 2026-04-29)

**Antes**: el flow se llamaba YATE y la palabra clave era `yate`. La landing era `/yate.html`.
**Ahora**: el flow se llama LUNA, palabra clave `luna`, landing `/reel-hiperrealista-con-claude.html`.

```
https://rafaprompts.com/reel-hiperrealista-con-claude.html
```

Pasos:
1. Manychat → Automation → Flows → buscar el flow "YATE" → renombrar a "LUNA"
2. Cambiar la palabra clave que dispara el flow: de `yate` a `luna` (añadir variantes `Luna`, `LUNA`)
3. En el nodo que manda el enlace de la guía, cambiar la URL `https://rafaprompts.com/yate.html` por `https://rafaprompts.com/reel-hiperrealista-con-claude.html`
4. Testear desde un móvil comentando `luna` en el reel YATE_LUNAR
5. Debe llegar el DM con el botón, y al pulsarlo abrir `rafaprompts.com/reel-hiperrealista-con-claude.html`

## Flow MADRUGÓN

Este flow aún no está activo (dependiente del reel en estado draft). Cuando lo publiques, usa:

```
https://rafaprompts.com/agente-creador-reels-claude.html
```

## Checklist antes de publicar el primer reel que use estas URLs

- [ ] DNS de `rafaprompts.com` propagado (verificar con `curl -I https://rafaprompts.com`)
- [ ] Página LUNA carga correctamente desde la URL final
- [ ] Botón del flow de Manychat apunta a la URL correcta
- [ ] Redirect `/yate.html → /reel-hiperrealista-con-claude.html` funcionando (para enlaces antiguos)
- [ ] Probado el flow completo desde una cuenta secundaria

## Notas

- La palabra clave que dispara el flow ahora es `luna` (antes era `yate`).
- Si hay que cambiar el copy del DM, hacerlo a la vez para que el flow tenga tono consistente con la landing nueva.
