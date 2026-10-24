import type { Project } from "./api";

export function projectTypeLabel(project: Pick<Project, "type" | "imageIntent">, t: (key: string) => string): string {
  const type = project.type;
  if (type === "image_post") {
    const intent = project.imageIntent;
    if (intent && intent !== "photo") {
      const kindLabel = t(`kinds.${intent}.label`);
      if (kindLabel && kindLabel !== `kinds.${intent}.label`) return kindLabel;
    }
    return t(`formats.${type}.title`) || type;
  }
  return t(`formats.${type}.title`) || type;
}
