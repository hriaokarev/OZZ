'use client'
import { useState } from 'react'
import { getToken, type Messaging } from 'firebase/messaging'
import { auth, db, getMessagingSafe } from '@/lib/firebase'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'

export default function EnablePush() {
  const [busy, setBusy] = useState(false)
  const [enabled, setEnabled] = useState(
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'granted'
  )

  return null
}