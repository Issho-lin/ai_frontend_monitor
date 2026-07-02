<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="wrap">
    <div class="code">404</div>
    <div class="msg">页面不存在或已被移除</div>
    <el-button type="primary" @click="router.push({ name: 'overview' })">回到总览</el-button>
  </div>
</template>

<style scoped>
.wrap {
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: var(--afm-bg);
}
.code {
  font-size: 64px;
  font-weight: 700;
  color: var(--afm-accent);
}
.msg {
  color: var(--afm-text-muted);
}
</style>
