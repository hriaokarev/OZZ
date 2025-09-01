'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Item = {
	href: string
	label: string
	icon: React.ReactNode
	isActive: (pathname: string) => boolean
}

function IconHome({ active }: { active: boolean }) {
	return (
		<svg width="24" height="24" viewBox="0 0 24 24"
			className={active ? 'text-pink-600' : 'text-gray-500'}
			fill="currentColor" aria-hidden="true">
			<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
		</svg>
	)
}

function IconPost({ active }: { active: boolean }) {
	return (
		<svg width="24" height="24" viewBox="0 0 24 24"
			className={active ? 'text-pink-600' : 'text-gray-500'}
			fill="currentColor" aria-hidden="true">
			<path d="M12 2a1 1 0 011 1v8h8a1 1 0 110 2h-8v8a1 1 0 11-2 0v-8H3a1 1 0 110-2h8V3a1 1 0 011-1z"></path>
		</svg>
	)
}

function IconThreads({ active }: { active: boolean }) {
	return (
		<svg width="24" height="24" viewBox="0 0 24 24"
			className={active ? 'text-pink-600' : 'text-gray-500'}
			fill="currentColor" aria-hidden="true">
			<path d="M20 6L9 17l-5-5" />
		</svg>
	)
}

function IconDM({ active }: { active: boolean }) {
	return (
		<svg width="24" height="24" viewBox="0 0 24 24"
			className={active ? 'text-pink-600' : 'text-gray-500'}
			fill="currentColor" aria-hidden="true">
			<path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
		</svg>
	)
}

function IconSettings({ active }: { active: boolean }) {
	return (
		<svg width="24" height="24" viewBox="0 0 24 24"
			className={active ? 'text-pink-600' : 'text-gray-500'}
			fill="currentColor" aria-hidden="true">
			<path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.82,11.69,4.82,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" />
		</svg>
	)
}

export default function FooterNav() {
	const pathname = usePathname()

	const items: Item[] = [
		{
			href: '/',
			label: 'ホーム',
			icon: <IconHome active={pathname === '/'} />,
			isActive: (p) => p === '/',
		},
		{
			href: '/threads',
			label: 'スレッド',
			icon: <IconThreads active={pathname.startsWith('/threads')} />,
			isActive: (p) => p.startsWith('/threads'),
		},
		{
			href: '/post',
			label: '投稿',
			icon: <IconPost active={pathname.startsWith('/post')} />,
			isActive: (p) => p.startsWith('/post'),
		},
		{
			href: '/chat',
			label: 'DM',
			icon: <IconDM active={pathname.startsWith('/chat')} />,
			isActive: (p) => p.startsWith('/chat'),
		},
		{
			href: '/settings',
			label: '設定',
			icon: <IconSettings active={pathname.startsWith('/settings')} />,
			isActive: (p) => p.startsWith('/settings'),
		},
	]

	return (
		<nav
			role="navigation"
			aria-label="フッターメニュー"
			className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/75"
		>
			<ul className="mx-auto grid max-w-xl grid-cols-5">
				{items.map((it) => {
					const active = it.isActive(pathname)
					return (
						<li key={it.href}>
							<Link
								href={it.href}
								className="flex h-18 flex-col items-center justify-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
								aria-current={active ? 'page' : undefined}
							>
								{it.icon}
								<span className={active ? 'text-[11px] font-semibold text-pink-600' : 'text-[11px] text-gray-500'}>
									{it.label}
								</span>
							</Link>
						</li>
					)
				})}
			</ul>
			<div className="pb-[env(safe-area-inset-bottom)]" />
		</nav>
	)
}
