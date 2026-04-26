# Glossário GLPI — campos e códigos

Use isso pra interpretar o `data` recebido. Nunca traduza ou inverta o mapeamento sozinho.

## Status do Ticket (campo `12` ou `status`)

| ID | Nome                            |
|----|---------------------------------|
| 1  | Novo                            |
| 2  | Em atendimento (atribuído)      |
| 3  | Em atendimento (planejado)      |
| 4  | Pendente                        |
| 5  | Solucionado                     |
| 6  | Fechado                         |

"notold" no resultado significa qualquer status ≠ 5 e ≠ 6 (chamado em aberto).

## Prioridade (campo `3` ou `priority`)

| ID | Nome           |
|----|----------------|
| 1  | Muito baixa    |
| 2  | Baixa          |
| 3  | Média          |
| 4  | Alta           |
| 5  | Muito alta     |
| 6  | Maior          |

Mesma escala vale para Urgência (`10`/`urgency`) e Impacto (`11`/`impact`).

## Campos comuns nos resultados de `/search/Ticket`

Quando o `data` é o retorno bruto da search (`{totalcount, count, sort, order, data: [...]}`), cada item em `data[]` tem chaves numéricas:

| Chave   | Conteúdo                              |
|---------|---------------------------------------|
| `"1"`   | Título                                |
| `"2"`   | ID do chamado                         |
| `"3"`   | Prioridade (1-6)                      |
| `"4"`   | Requerente                            |
| `"5"`   | Técnico                               |
| `"6"`   | Fornecedor atribuído                  |
| `"7"`   | Categoria ITIL                        |
| `"8"`   | Grupo técnico                         |
| `"12"`  | Status (1-6)                          |
| `"15"`  | Data de abertura                      |
| `"19"`  | Última atualização                    |
| `"21"`  | Descrição                             |
| `"83"`  | Localização — **na Carmel = Hotel**   |
| `"10500"` | Etiquetas (texto, vírgula-separado) |
| `"76677"` | Ticket Externo - Ticket ID          |

**Importante para a Carmel Hotéis**: o campo `83` (Localização) é onde o hotel da unidade fica registrado. Sempre que o briefing pedir "por hotel", "por unidade", "por localização", agrupar por `r["83"]`. Pode vir string vazia ou null — bucket esses como `"Sem hotel definido"`.

## Campos no resultado de `/Ticket/<id>` (expandido)

Aí vêm chaves nominadas: `id`, `name` (=título), `content`, `status`, `priority`, `urgency`, `impact`, `users_id_recipient`, `groups_id_assign`, `suppliers_id_assign`, `date`, `date_mod`, `closedate`, `solvedate`, `time_to_resolve`, `time_to_own`.

## Datas

Vêm em ISO ou `YYYY-MM-DD HH:mm:ss`. Converta para `DD/MM/YYYY` ao exibir. Para idade: `(agora - date) em dias/horas`.

## Etiquetas (plugin Tag)

Quando vier no campo `10500`, é string com nomes separados por vírgula. IDs canônicos (consultar STACK→etiquetas se quiser cor exata):

| ID  | Nome                              | Cor       |
|-----|-----------------------------------|-----------|
| 203 | Aberta                            | `#45818e` |
| 205 | Aguardando Fornecedor             | `#f1c232` |
| 206 | Aguardando Requerente             | `#8e7cc3` |
| 207 | Em Homologação/Testes             | `#6d9eeb` |
| 208 | Concluída                         | `#6aa84f` |
| 209 | Cancelada                         | `#cc0000` |
| 210 | Em Andamento                      | `#0b5394` |
| 211 | Aguardando Colaboração Interna    | `#f1c232` |
| 217 | Em Planejamento                   | `#a64d79` |
| 219 | Solucionado                       | `#6aa84f` |
| 222 | Backlog                           | `#2986cc` |
