<template>
  <div class="min-h-screen flex flex-col">
    <nav class="bg-white border-b px-6 py-3 flex items-center gap-6">
      <h1 class="text-lg font-bold text-blue-600">agent-eval</h1>
      <router-link to="/config" class="nav-link">配置</router-link>
      <router-link to="/run" class="nav-link">运行</router-link>
      <router-link to="/history" class="nav-link">历史</router-link>
    </nav>
    <main class="flex-1 p-6">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.nav-link {
  @apply text-sm text-gray-600 hover:text-blue-600 transition-colors;
}
.router-link-active {
  @apply text-blue-600 font-medium;
}
</style>
