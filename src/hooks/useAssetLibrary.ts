import { useCallback, useEffect, useState } from 'react'
import {
  deleteAsset,
  listAssets,
  renameAsset,
  uploadAsset,
  type AssetType,
  type ManagedAsset,
} from '../data/manage'

export interface AssetLibrary {
  assets: ManagedAsset[]
  loading: boolean
  error: string | null
  /** True while an upload, a rename or a delete is in flight, so the UI can disable its controls. */
  busy: boolean
  refresh: () => Promise<void>
  upload: (files: File[]) => Promise<void>
  rename: (assetKey: string, assetName: string) => Promise<void>
  remove: (assetKey: string) => Promise<void>
  /** Look a key up for a preview - the config stores keys, the list carries the URLs. */
  findByKey: (assetKey: string) => ManagedAsset | undefined
}

/**
 * The uploaded asset list, shared by the library section and the pickers.
 *
 * Held in one place so that uploading in the library immediately makes the new asset selectable in
 * every picker, and deleting removes it everywhere, without either having to reload the page.
 */
export function useAssetLibrary(type: AssetType): AssetLibrary {
  const [assets, setAssets] = useState<ManagedAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setAssets(await listAssets(type))
      setError(null)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : '목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [type])

  // 첫 목록만 여기서 받아 옵니다. 화면을 떠난 뒤 응답이 와도 상태를 건드리지 않도록 막습니다.
  useEffect(() => {
    let active = true
    listAssets(type)
      .then((list) => {
        if (!active) return
        setAssets(list)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!active) return
        console.error(err)
        setError(err instanceof Error ? err.message : '목록을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [type])

  /** 한 가지 일을 하고, 끝나면 목록을 다시 받아 옵니다. 실패는 화면에 남겨 둡니다. */
  const run = useCallback(
    async (work: () => Promise<void>, whenItFails: string) => {
      setBusy(true)
      try {
        await work()
        setError(null)
      } catch (err) {
        console.error(err)
        setError(err instanceof Error ? err.message : whenItFails)
      } finally {
        setBusy(false)
        await refresh()
      }
    },
    [refresh],
  )

  const upload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      // One at a time: each upload is three round trips, and a failure part way through should
      // leave the ones already finished in place rather than being lost in a batch error.
      await run(async () => {
        for (const file of files) {
          await uploadAsset(type, file)
        }
      }, '파일을 올리지 못했습니다.')
    },
    [run, type],
  )

  const rename = useCallback(
    (assetKey: string, assetName: string) =>
      run(async () => {
        await renameAsset(type, assetKey, assetName)
      }, '이름을 바꾸지 못했습니다.'),
    [run, type],
  )

  const remove = useCallback(
    (assetKey: string) =>
      run(async () => {
        await deleteAsset(type, assetKey)
      }, '지우지 못했습니다.'),
    [run, type],
  )

  const findByKey = useCallback(
    (assetKey: string) => assets.find((asset) => asset.assetKey === assetKey),
    [assets],
  )

  return { assets, loading, error, busy, refresh, upload, rename, remove, findByKey }
}
