import assert from "node:assert/strict";
import { projectTypeLabel } from "./projectTypeLabel";

const t = (key: string) => ({
  "formats.image_post.title": "Картинка / пост",
  "kinds.own.label": "Готова картинка",
  "kinds.certificate.label": "Сертифікат",
  "kinds.invite.label": "Запрошення",
  "formats.own_image.title": "Змінити готову картинку",
}[key] || key);

assert.equal(projectTypeLabel({ type: "image_post", imageIntent: "photo" }, t), "Картинка / пост");
assert.equal(projectTypeLabel({ type: "image_post", imageIntent: "own" }, t), "Готова картинка");
assert.equal(projectTypeLabel({ type: "image_post", imageIntent: "certificate" }, t), "Сертифікат");
assert.equal(projectTypeLabel({ type: "own_image" }, t), "Змінити готову картинку");
console.log("projectTypeLabel ok");
