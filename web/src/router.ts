import { createRouter, createWebHistory } from "vue-router";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/config" },
    { path: "/config", component: () => import("./views/ConfigView.vue") },
    { path: "/run", component: () => import("./views/RunView.vue") },
    { path: "/history", component: () => import("./views/HistoryView.vue") },
    { path: "/results/:runId", component: () => import("./views/ResultView.vue"), props: true },
    { path: "/results/:runId/cases/:caseId", component: () => import("./views/CaseDetailView.vue"), props: true },
  ],
});
