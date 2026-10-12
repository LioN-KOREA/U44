import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig, loadEnv } from 'vite'

/**
 * 개발 서버에서도 `/lpx/*` 를 계정관리 시스템으로 그대로 넘겨 줍니다.
 *
 * 배포본에서는 CloudFront 가 같은 일을 합니다 (backend/template.yaml 의 /lpx/* 동작).
 * 양쪽 모두에서 브라우저가 보기에 같은 출처가 되므로, 프런트엔드 코드는 `/lpx/auth/login` 처럼
 * 상대 경로만 부르면 되고 CORS 예비 요청도 없습니다.
 *
 * `changeOrigin` 은 Host 를 업스트림 것으로 바꿉니다. 이것이 없으면 업스트림이 Host 로 라우팅을
 * 하지 못해 모든 요청이 403 이 됩니다 (reference.md 의 "Not forward the viewer's Host header").
 */
const DEFAULT_AUTH_UPSTREAM = 'https://d3mfomuay6suit.cloudfront.net'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const authUpstream = process.env.AUTH_UPSTREAM_URL || env.AUTH_UPSTREAM_URL || DEFAULT_AUTH_UPSTREAM

  return {
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] })
    ],
    server: {
      proxy: {
        '/lpx': {
          target: authUpstream,
          changeOrigin: true,
          secure: true,
        },
      },
    },
  }
})
