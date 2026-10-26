<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { DocumentCopy } from '@element-plus/icons-vue'

const installSnippet = `pnpm add @ai-frontend-monitor/sdk`

const releaseMetaSnippet = `<meta name="afm-release" content="1.4.2">`

const releaseHtmlSnippet = `<meta name="afm-release" content="__AFM_RELEASE__">`

const releaseViteSnippet = `import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const { version } = JSON.parse(readFileSync('./package.json', 'utf8'))

export default defineConfig({
  plugins: [
    // 保留原来的 vue() 或 react()
    {
      name: 'afm-release',
      transformIndexHtml(html) {
        return html.replaceAll('__AFM_RELEASE__', version)
      },
    },
  ],
})`

const initOptions = `afmInit({
  projectId: 'demo',
  env: 'production',
  endpoint: 'http://127.0.0.1:3001/ingest',
})`

const initExamples = [
  {
    name: 'vue',
    label: 'Vue',
    file: 'src/main.ts',
    note: '写在 createApp 之前。装了 Vue Router 之后，路径变化会再记一次。',
    code: `import { createApp } from 'vue'
import { afmInit } from '@ai-frontend-monitor/sdk'
import App from './App.vue'
import router from './router'

${initOptions}

createApp(App).use(router).mount('#app')`,
  },
  {
    name: 'react',
    label: 'React',
    file: 'src/main.tsx',
    note: '写在 createRoot 之前。装了 React Router 之后，路径变化会再记一次。',
    code: `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { afmInit } from '@ai-frontend-monitor/sdk'
import App from './App'

${initOptions}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)`,
  },
  {
    name: 'js',
    label: '普通 JS',
    file: 'main.js',
    note: '写在入口脚本最上面，用 script type="module" 引入。没有前端路由时，每次整页打开记一次。',
    code: `import { afmInit } from '@ai-frontend-monitor/sdk'

${initOptions}

// 后面是页面自己的逻辑`,
  },
]

const initTab = ref(initExamples[0].name)

const manualSnippet = `import { afmTrackError, afmTrackApiTiming, afmTrackResource, afmFlush } from '@ai-frontend-monitor/sdk'

afmTrackError({
  name: 'TypeError',
  message: "Cannot read properties of undefined (reading 'items')",
  stack: error.stack,
})

afmTrackApiTiming({
  apiRoute: '/api/orders/:id',
  method: 'GET',
  statusCode: 200,
  duration: 420,
})

afmTrackResource({
  url: '/static/banner.png',
  initiatorType: 'img',
  size: 190000,
  duration: 1620,
})

await afmFlush()`

const features = [
  { name: '总览', detail: '看所选时间（近 24 小时、近 7 天或近 30 天）的整体体验：独立用户、受影响用户、达标率、可切换的 LCP / INP / 接口 P95 / JS 错误率趋势，以及影响用户最多的异常。' },
  { name: '异常中心', detail: '把 JavaScript 异常、未处理的 Promise 和资源加载失败按堆栈归成一组，看次数、影响用户、版本，以及这段时间的上报次数。近 24 小时按小时，近 7 天和近 30 天按天。最近 1 小时内还有上报记为仍在发生，否则记为已停歇。' },
  { name: '性能体验', detail: '按页面路由看访问量、Web Vitals、错误率和接口耗时，判断哪个页面拖了体验。' },
  { name: '请求分析', detail: '按接口路径看耗时分位、错误率、超时率和 Trace 覆盖。点进一个接口可以看状态分布、P95 趋势，以及它出现在哪些页面。近 24 小时按小时，更长的时间按天。' },
  { name: '用户会话', detail: '按所选时间里的一次访问查看页面、设备、地区、网络、停留时间和操作步骤。有脚本错误记为异常。LCP 超过 2.5 秒记为缓慢，手机上的会话按 3 秒。这里没有会话回放。' },
  { name: '告警中心', detail: '服务每分钟检查最近 10 分钟，并和更早的基线比。LCP P75 超过 2.5 秒且比基线高 20% 以上会告警，达到 4 秒记为 S0。JS 错误率超过 1%、接口错误率超过 2%，并且各自比基线高 20% 以上，也会告警；分别达到 10% 记为 S0。样本太少时不告警：错误率至少 5 个会话，接口至少 20 次请求。可以认领、静默或标记误报。' },
  { name: '排障', detail: '从异常或告警点进去，看调用栈、最近一次命中这次问题的访问步骤，以及这个页面的资源。版本对比用同一环境里上一版本的全部上报对比本版本；没有上一版本或没有样本时不计算涨跌。' },
]

const overviewMetrics = [
  { name: '无错误会话率', meaning: '没有上报过任何错误的会话，占全部会话的比例。', line: '≥ 99.5%' },
  { name: '独立用户', meaning: '所选时间里出现过的匿名用户数，按用户号去重。人数变多或变少都不代表好坏。', line: '—' },
  { name: '受影响用户', meaning: '命中过错误、极差体验或接口失败的去重用户数。极差体验指 LCP > 4s、INP > 500ms、CLS > 0.25 或 TTFB > 1.8s。接口失败指 5xx、状态码 0 或超时。', line: '越少越好' },
  { name: 'P75 LCP', meaning: '最大内容绘制的 75 分位。75% 的样本不慢于这个时间。单位是秒或毫秒。', line: '≤ 2.5s' },
  { name: 'API 成功率', meaning: '状态码为 2xx，且没有标记超时的接口请求占比。没有接口样本时显示为 —，不记为达标。', line: '≥ 99.5%' },
  { name: '白屏率', meaning: '已经结束至少 1 分钟、并且有页面访问的会话里，始终没有 LCP 或 FCP 的比例。同一次打开里的路由切换只算一个会话。还在加载的会话先不计入。没有这样的会话时显示为 —。', line: '< 0.05%' },
  { name: 'LCP / FCP / INP / CLS / TTFB 达标率', meaning: '按页面 PV 加权。该页对应指标的 P75 落在良好线内，这一页的访问算达标。达到 75% 记为良好。', line: '≥ 75%' },
  { name: '请求成功率', meaning: '和 API 成功率同一口径，用在体验健康度里。没有接口样本时显示为暂无样本。', line: '≥ 99.5%' },
]

const fieldMetrics = [
  { name: 'PV', meaning: '页面访问次数。打开页面计一次，前端路由变化再计一次，由 afmInit 之后的自动采集上报。' },
  { name: '受影响用户', meaning: '和总览同一口径，按页面统计：命中过错误、极差体验或接口失败的去重用户，不是这个页面的访问人数。' },
  { name: 'FCP', meaning: '首次内容绘制，用户看到第一块内容的时间。', line: '≤ 1.8s' },
  { name: 'INP', meaning: '交互到下一次绘制的延迟，衡量点击、输入是否卡。', line: '≤ 200ms' },
  { name: 'CLS', meaning: '布局偏移的累计值，没有单位。数值越大，页面元素越容易乱跳。', line: '≤ 0.1' },
  { name: 'TTFB', meaning: '从发起请求到收到第一个字节的时间。', line: '≤ 800ms' },
  { name: 'JS 错误率', meaning: '该页面的错误次数，除以页面访问次数。' },
  { name: 'P50 / P95', meaning: '把请求按耗时从快到慢排列。P50 是正中间，一半比它快、一半比它慢，接近典型用户。P95 是第 95% 位，95% 的请求不慢于它，用来看较慢的请求。没有样本时显示为 —。' },
  { name: 'API P95', meaning: '这个页面上接口耗时的第 95% 位。95% 的请求不慢于它。不超过 800ms 算通过。所选时间没有接口样本时显示为 —，不记成 0ms，也不算进达标率。' },
  { name: '错误率', meaning: '状态码 ≥ 400，或状态码为 0 的接口请求占比。' },
  { name: '超时率', meaning: '上报时标记了超时的接口请求占比。' },
  { name: 'QPS', meaning: '最近 5 分钟的请求次数除以 300。没有新请求时是 0。成功率按所选时间的请求数计算。' },
  { name: 'Trace 覆盖率', meaning: '带了 trace id 的接口请求占比，用来看链路能否对上后端。' },
  { name: '页面达标率', meaning: '有样本的检查里，通过项的比例。检查包括 LCP、FCP、INP、CLS、TTFB 是否达到良好线，JS 错误率是否 ≤ 0.5%，API P95 是否 ≤ 800ms。没有样本的项不参与计算。一项都没有时显示为 —。' },
]

function copy(value: string) {
  void navigator.clipboard.writeText(value)
  ElMessage.success('已复制')
}
</script>

<template>
  <div class="afm-page doc">
    <div class="afm-card">
      <div class="afm-section-title">这个系统做什么</div>
      <p>
        这是前端真实用户监控。浏览器里的访问、体验指标、脚本错误和接口耗时上报后，在控制台按项目和环境查看。
        它只负责发现和定位问题，不负责任务分配和修复跟踪。
      </p>
      <el-table :data="features" size="default" class="metric-table">
        <el-table-column label="页面" prop="name" width="120" />
        <el-table-column label="用来看什么" prop="detail" min-width="360" />
      </el-table>
    </div>

    <div class="afm-card section">
      <div class="afm-section-title">指标分别代表什么</div>
      <p>总览和体验健康度跟着顶部的时间：近 24 小时、近 7 天或近 30 天，并和同样长度的上一时段比较。没有样本时显示 —，不拿 0 或 100% 凑数。顶部还可以按应用、环境和版本收窄。搜索可以找到页面、异常、会话、接口和告警。告警规则仍按最近 10 分钟对照更早的 24 小时基线判断，不跟着这个时间改。</p>
      <el-table :data="overviewMetrics" size="default" class="metric-table">
        <el-table-column label="指标" prop="name" width="180" />
        <el-table-column label="含义" prop="meaning" min-width="360" />
        <el-table-column label="良好线" prop="line" width="120" />
      </el-table>
      <p class="group-label">页面、接口上还会看到这些</p>
      <el-table :data="fieldMetrics" size="default" class="metric-table">
        <el-table-column label="指标" prop="name" width="180" />
        <el-table-column label="含义" prop="meaning" min-width="360" />
        <el-table-column label="良好线" width="120">
          <template #default="{ row }">{{ row.line || '—' }}</template>
        </el-table-column>
      </el-table>
    </div>

    <div class="afm-card section">
      <div class="afm-section-title">接入 SDK</div>
      <p>
        在业务前端安装 <code>@ai-frontend-monitor/sdk</code>，应用启动时调用一次 <code>afmInit</code>。
        页面访问、Web Vitals、脚本错误和接口耗时都会自动上报，不用在每个页面或每个接口里再写一遍。
      </p>
    </div>

    <div class="afm-card section">
      <div class="afm-section-title">
        1. 安装
        <el-button class="head-link" link :icon="DocumentCopy" @click="copy(installSnippet)">复制</el-button>
      </div>
      <pre class="afm-log">{{ installSnippet }}</pre>
    </div>

    <div class="afm-card section">
      <div class="afm-section-title">2. 初始化一次</div>
      <p>三种项目都只调用一次 <code>afmInit</code>，参数相同。差别只在放进哪个入口文件。</p>
      <el-tabs v-model="initTab" class="init-tabs">
        <el-tab-pane v-for="example in initExamples" :key="example.name" :name="example.name">
          <template #label>
            <span class="tab-label">
              <svg v-if="example.name === 'vue'" viewBox="0 0 262 227" aria-hidden="true">
                <path fill="#41b883" d="M161.1 0 130.9 52.4 100.6 0H0L130.9 226.7 261.8 0z" />
                <path fill="#35495e" d="M161.1 0 130.9 52.4 100.6 0H52.3l78.6 136L209.4 0z" />
              </svg>
              <svg v-else-if="example.name === 'react'" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="2.05" fill="#61dafb" />
                <g fill="none" stroke="#61dafb" stroke-width="1.15">
                  <ellipse cx="12" cy="12" rx="10.2" ry="3.9" />
                  <ellipse cx="12" cy="12" rx="10.2" ry="3.9" transform="rotate(60 12 12)" />
                  <ellipse cx="12" cy="12" rx="10.2" ry="3.9" transform="rotate(120 12 12)" />
                </g>
              </svg>
              <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                <rect width="24" height="24" rx="3" fill="#f7df1e" />
                <text x="12" y="16.4" text-anchor="middle" font-size="11" font-family="ui-sans-serif, system-ui, sans-serif" font-weight="700" fill="#323330">JS</text>
              </svg>
              {{ example.label }}
            </span>
          </template>
          <div class="snippet-head">
            <span>{{ example.file }} · {{ example.note }}</span>
            <el-button link :icon="DocumentCopy" @click="copy(example.code)">复制</el-button>
          </div>
          <pre class="afm-log">{{ example.code }}</pre>
        </el-tab-pane>
      </el-tabs>
      <ul>
        <li><code>projectId</code> 当前使用 <code>demo</code>，上报到本地网关时不需要 token。</li>
        <li><code>env</code> 取 <code>production</code>、<code>staging</code> 或 <code>test</code>，控制台按这个字段过滤。</li>
        <li>版本号不写在 <code>afmInit</code> 里。没有版本就什么都不用加，控制台的版本列显示 —。</li>
        <li><code>endpoint</code> 默认是 <code>http://127.0.0.1:3001/ingest</code>。生产环境改成网关地址。</li>
        <li><code>sampleRate</code> 默认 <code>1</code>，表示全量上报。小于 1 时按这一次访问决定采不采，刷新页面不会改决定。</li>
      </ul>
      <p class="group-label">项目有版本号时</p>
      <p>
        SDK 跑在浏览器里，读不到 <code>package.json</code>。它只看页面 <code>&lt;head&gt;</code> 里的一个标签。
        发版时改这个标签，不用改 <code>afmInit</code>。
      </p>
      <div class="snippet-head">
        <span>index.html · 版本很少改时，直接写上当前版本</span>
        <el-button link :icon="DocumentCopy" @click="copy(releaseMetaSnippet)">复制</el-button>
      </div>
      <pre class="afm-log">{{ releaseMetaSnippet }}</pre>
      <p>
        用 Vite 的 Vue 或 React 项目可以配一次，以后只改 <code>package.json</code> 里的 <code>"version"</code>，再执行打包。
        页面上的版本会变成那个号。
      </p>
      <div class="snippet-head">
        <span>index.html · 先放占位符</span>
        <el-button link :icon="DocumentCopy" @click="copy(releaseHtmlSnippet)">复制</el-button>
      </div>
      <pre class="afm-log">{{ releaseHtmlSnippet }}</pre>
      <div class="snippet-head">
        <span>vite.config.ts · 加进现有 plugins，不要删掉原来的插件</span>
        <el-button link :icon="DocumentCopy" @click="copy(releaseViteSnippet)">复制</el-button>
      </div>
      <pre class="afm-log">{{ releaseViteSnippet }}</pre>
      <p>占位符如果没被替换，SDK 会当成没有版本，不会把 <code>__AFM_RELEASE__</code> 上报上去。</p>
    </div>

    <div class="afm-card section">
      <div class="afm-section-title">3. 初始化之后会自动采集</div>
      <ul>
        <li>当前页面的访问。使用 Vue Router、React Router 这类前端路由时，路径变化会再记一次。数字、长 hex 和 UUID 会折成 <code>:id</code>。</li>
        <li>FCP、LCP、TTFB 在页面加载后上报。INP 和 CLS 在离开页面或切到后台时上报，避免把还没结束的中间值算进分位。</li>
        <li>JavaScript 异常、<code>unhandledrejection</code>，以及图片、脚本、样式加载失败。</li>
        <li><code>fetch</code> 和 <code>XMLHttpRequest</code> 的方法、路径、状态码和耗时。axios 默认走 XHR，也会被记上。</li>
        <li>离开页面时带上资源瀑布。错误、接口和资源先放在内存里，空闲时用 <code>fetch</code> 发出，页面关闭时才用 <code>sendBeacon</code>。<code>afmInit({ autoTrack: false })</code> 可以关掉自动采集。</li>
        <li>会话号记在当前标签页，匿名用户号记在本机。浏览器、系统和网络类型会写成短名称，例如 Chrome、macOS、4g。</li>
      </ul>
    </div>

    <div class="afm-card section">
      <div class="afm-section-title">
        4. 需要时手动补报
        <el-button class="head-link" link :icon="DocumentCopy" @click="copy(manualSnippet)">复制</el-button>
      </div>
      <pre class="afm-log">{{ manualSnippet }}</pre>
      <p>
        手动接口留给自己 catch 住的异常，以及不走 <code>fetch</code> / <code>XMLHttpRequest</code> 的请求。
        页面访问和 Web Vitals 已经自动采集，再调用 <code>afmTrackPageView</code> 或 <code>afmTrackWebVital</code> 会多记一次。
        <code>afmFlush()</code> 会立刻把缓冲区里的自动采集事件发出去。
      </p>
    </div>

    <div class="afm-card section">
      <div class="afm-section-title">5. 确认数据已经进来</div>
      <ol>
        <li>本地先启动网关，确认 <code>POST /ingest</code> 返回 <code>accepted</code>。</li>
        <li>打开控制台总览、异常中心、性能体验、请求分析，把环境选成和 <code>afmInit</code> 里一致。</li>
        <li>页面指标看性能体验，错误看异常中心，<code>fetch</code> 耗时看请求分析。</li>
      </ol>
    </div>
  </div>
</template>

<style scoped>
.section { margin-top: 16px; }
.doc p, .doc li { color: var(--afm-text-secondary); line-height: 1.7; }
.doc p { margin: 8px 0 0; }
.doc ul, .doc ol { margin: 12px 0 0; padding-left: 18px; }
.doc li + li { margin-top: 6px; }
.doc code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.head-link { margin-left: auto; }
.init-tabs { margin-top: 12px; }
.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.tab-label svg {
  width: 16px;
  height: 16px;
  display: block;
  flex: none;
}
.snippet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  color: var(--afm-text-muted);
  font-size: 12px;
  line-height: 1.6;
}
.afm-log { margin: 8px 0 0; }
.group-label { margin-top: 18px; font-weight: 600; color: var(--afm-text); }
.metric-table { margin-top: 12px; }
</style>
