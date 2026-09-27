// @ts-nocheck
export function cardFromNode(node, project) {
  const card = node?.projectItems?.nodes?.find((i) => String(i?.project?.number) === String(project));
  if (!card) return null;
  const item = {
    id: card.id,
    content: { type: node.__typename, number: node.number, title: node.title },
    title: node.title,
    labels: (node.labels?.nodes ?? []).map((l) => l.name)
  };
  for (const v of card.fieldValues?.nodes ?? [])
    if (v?.field?.name && v.name) item[v.field.name.toLowerCase()] = v.name;
  return item;
}
