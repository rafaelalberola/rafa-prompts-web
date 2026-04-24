# Manychat : URLs a actualizar (manual)

Manychat no permite actualizar flows vía API pública. Entra al editor de Manychat y actualiza estos enlaces en los flows correspondientes.

## Flow YATE

**Antes** : el botón "lo quiero" enviaba un enlace a Notion.
**Ahora** : reemplazar por la URL de la landing.

```
https://rafaprompts.com/yate.html
```

Pasos:
1. Manychat → Automation → Flows → buscar el flow "YATE"
2. En el nodo que manda el enlace de la guía, cambiar la URL de Notion por la de arriba
3. Testear desde un móvil comentando la palabra clave en el reel de prueba
4. Debe llegar el DM con el botón, y al pulsarlo abrir `rafaprompts.com/yate.html`

## Flow MADRUGÓN

Este flow aún no está activo (dependiente del reel en estado draft). Cuando lo publiques, usa:

```
https://rafaprompts.com/madrugon.html
```

## Checklist antes de publicar el primer reel que use estas URLs

- [ ] DNS de `rafaprompts.com` propagado (verificar con `curl -I https://rafaprompts.com`)
- [ ] Página YATE carga correctamente desde la URL final
- [ ] Botón del flow de Manychat apunta a la URL correcta
- [ ] Probado el flow completo desde una cuenta secundaria

## Notas

- No cambiar las palabras clave que disparan el flow (siguen siendo `yate` y `madrugón`).
- Si hay que cambiar el copy del DM, hacerlo a la vez para que el flow tenga tono consistente con la landing nueva.
