WITH TodasInteracoes AS (
    SELECT 
        gf.items_id AS ticket_id,
        gf.date,
        gf.users_id,
        'followup' AS tipo 
    FROM glpi_itilfollowups gf
    WHERE gf.itemtype = 'Ticket'

    UNION ALL

    SELECT 
        tt.tickets_id AS ticket_id,
        tt.date,
        tt.users_id,
        'task' AS tipo 
    FROM glpi_tickettasks tt
),
InteracoesRankeadas AS (
    SELECT 
        t.ticket_id,
        t.users_id,
        t.date,
        ROW_NUMBER() OVER (PARTITION BY t.ticket_id ORDER BY t.date DESC) as rnk
    FROM TodasInteracoes t
    INNER JOIN glpi_tickets tic ON t.ticket_id = tic.id
    WHERE tic.is_deleted = 0 
      AND tic.status NOT IN (5, 6)
)

SELECT
  t.items_id AS ticket_id,
  COUNT(DISTINCT t.plugin_tag_tags_id) AS tag_count,
  GROUP_CONCAT(DISTINCT tag.name ORDER BY tag.name SEPARATOR '; ') AS tags,
  1 AS motivo_id,
  "Chamados com mais de uma etiqueta" AS motivo
FROM glpi_plugin_tag_tagitems t
JOIN glpi_plugin_tag_tags tag ON tag.id = t.plugin_tag_tags_id
JOIN glpi_tickets tic ON tic.id = t.items_id
WHERE t.itemtype = 'Ticket'
  AND tic.is_deleted = 0
  AND tic.status NOT IN (1, 5, 6)
GROUP BY t.items_id
HAVING COUNT(DISTINCT t.plugin_tag_tags_id) > 1

UNION ALL

SELECT
  t.items_id AS ticket_id,
  COUNT(DISTINCT t.plugin_tag_tags_id) AS tag_count,
  GROUP_CONCAT(DISTINCT tag.name ORDER BY tag.name SEPARATOR '; ') AS tags,
  2 AS motivo_id,
  "Etiqueta 'Aguardando' mas a última resposta é do Requerente" AS motivo
FROM glpi_plugin_tag_tagitems t
JOIN glpi_plugin_tag_tags tag ON tag.id = t.plugin_tag_tags_id
JOIN glpi_tickets tic ON tic.id = t.items_id
INNER JOIN InteracoesRankeadas ir ON ir.ticket_id = t.items_id AND ir.rnk = 1
INNER JOIN glpi_users u ON ir.users_id = u.id
WHERE t.itemtype = 'Ticket'
  AND tic.is_deleted = 0
  AND tic.status NOT IN (5, 6)
  AND tag.id = 206 
  AND u.usercategories_id = 20 
GROUP BY t.items_id

UNION ALL

SELECT
  t.items_id AS ticket_id,
  COUNT(DISTINCT t.plugin_tag_tags_id) AS tag_count,
  GROUP_CONCAT(DISTINCT tag.name ORDER BY tag.name SEPARATOR '; ') AS tags,
  3 AS motivo_id,
  "Status Pendente sem etiqueta condizente (Backlog/Aguardando)" AS motivo
FROM glpi_plugin_tag_tagitems t
JOIN glpi_plugin_tag_tags tag ON tag.id = t.plugin_tag_tags_id
JOIN glpi_tickets tic ON tic.id = t.items_id
WHERE t.itemtype = 'Ticket'
  AND tic.is_deleted = 0
  AND tic.status = 4
GROUP BY t.items_id
HAVING SUM(CASE WHEN tag.id IN (206, 211, 222) THEN 1 ELSE 0 END) = 0

UNION ALL

SELECT
  t.items_id AS ticket_id,
  COUNT(DISTINCT t.plugin_tag_tags_id) AS tag_count,
  GROUP_CONCAT(DISTINCT tag.name ORDER BY tag.name SEPARATOR '; ') AS tags,
  4 AS motivo_id,
  "Etiqueta 'Aguardando Fornecedor' sem fornecedor associado" AS motivo
FROM glpi_plugin_tag_tagitems t
JOIN glpi_plugin_tag_tags tag ON tag.id = t.plugin_tag_tags_id
JOIN glpi_tickets tic ON tic.id = t.items_id
WHERE t.itemtype = 'Ticket'
  AND tic.is_deleted = 0
  AND tic.status NOT IN (5, 6)
  AND tag.id = 205
  AND t.items_id NOT IN (SELECT tickets_id FROM glpi_suppliers_tickets)
GROUP BY t.items_id

UNION ALL

SELECT
  t.items_id AS ticket_id,
  COUNT(DISTINCT t.plugin_tag_tags_id) AS tag_count,
  GROUP_CONCAT(DISTINCT tag.name ORDER BY tag.name SEPARATOR '; ') AS tags,
  5 AS motivo_id,
  "Aguardando Colaboração Interna há mais de 2 dias sem alteração" AS motivo
FROM glpi_plugin_tag_tagitems t
JOIN glpi_plugin_tag_tags tag ON tag.id = t.plugin_tag_tags_id
JOIN glpi_tickets tic ON tic.id = t.items_id
WHERE t.itemtype = 'Ticket'
  AND tic.is_deleted = 0
  AND tic.status NOT IN (5, 6)
  AND tag.id = 211
  AND tic.date_mod < DATE_SUB(NOW(), INTERVAL 2 DAY)
GROUP BY t.items_id

ORDER BY motivo_id;