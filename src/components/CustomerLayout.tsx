import { useEffect } from 'react'
import { Outlet } from 'react-router'
import { installCallSoundUnlock } from '../lib/callSound'
import { storeStyle } from '../lib/colors'
import { useWakeLock } from '../lib/wakeLock'
import { wording } from '../lib/wording'
import { ReadyCallOverlay } from './ReadyCall'
import { useReadyCalls } from './useReadyCall'

/** お客様の画面の共通部分。どの画面（お店一覧・お品書き・注文状況）を見ていても、注文の呼び出しを音・振動・画面で知らせる。 */
export function CustomerLayout() {
  useEffect(() => installCallSoundUnlock(), [])
  const { call, dismiss, waiting } = useReadyCalls()
  // 待っている注文があるあいだは、画面が暗くならないようにする（呼び出しを見逃さないように）
  useWakeLock(waiting)
  const w = wording(call?.shop.business_type)

  return (
    <>
      <Outlet />
      {call && (
        <ReadyCallOverlay
          key={call.order_no}
          shopName={call.shop.name}
          orderNo={call.order_no}
          heading={w.headingReady}
          message={w.readyMessage}
          style={storeStyle(call.shop.color)}
          onClose={dismiss}
        />
      )}
    </>
  )
}
