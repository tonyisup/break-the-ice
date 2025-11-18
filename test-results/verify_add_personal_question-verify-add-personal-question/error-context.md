# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]: "[plugin:vite:import-analysis] Failed to resolve import \"@/components/ui/dialog\" from \"src/components/add-personal-question-dialog/AddPersonalQuestionDialog.tsx\". Does the file exist?"
  - generic [ref=e5]: /app/src/components/add-personal-question-dialog/AddPersonalQuestionDialog.tsx:11:7
  - generic [ref=e6]: "26 | DialogTitle, 27 | DialogFooter 28 | } from \"@/components/ui/dialog\"; | ^ 29 | import { Button } from \"@/components/ui/button\"; 30 | import { Textarea } from \"@/components/ui/textarea\";"
  - generic [ref=e7]: at TransformPluginContext._formatLog (file:///app/node_modules/vite/dist/node/chunks/dep-BuM4AdeL.js:42416:41) at TransformPluginContext.error (file:///app/node_modules/vite/dist/node/chunks/dep-BuM4AdeL.js:42413:16) at normalizeUrl (file:///app/node_modules/vite/dist/node/chunks/dep-BuM4AdeL.js:40392:23) at process.processTicksAndRejections (node:internal/process/task_queues:105:5) at async file:///app/node_modules/vite/dist/node/chunks/dep-BuM4AdeL.js:40511:37 at async Promise.all (index 7) at async TransformPluginContext.transform (file:///app/node_modules/vite/dist/node/chunks/dep-BuM4AdeL.js:40438:7) at async EnvironmentPluginContainer.transform (file:///app/node_modules/vite/dist/node/chunks/dep-BuM4AdeL.js:42211:18) at async loadAndTransform (file:///app/node_modules/vite/dist/node/chunks/dep-BuM4AdeL.js:35669:27) at async viteTransformMiddleware (file:///app/node_modules/vite/dist/node/chunks/dep-BuM4AdeL.js:37167:24
  - generic [ref=e8]:
    - text: Click outside, press Esc key, or fix the code to dismiss.
    - text: You can also disable this overlay by setting
    - code [ref=e9]: server.hmr.overlay
    - text: to
    - code [ref=e10]: "false"
    - text: in
    - code [ref=e11]: vite.config.ts
    - text: .
```