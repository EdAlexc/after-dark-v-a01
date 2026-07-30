import type { ReactNode } from "react";
import type { Metadata } from "next";
import "./global.css";
import { Providers } from "./providers";

// Nonce-based CSP (middleware) requires per-request rendering: statically
// prerendered HTML cannot carry a fresh script nonce, so its inline
// bootstrap scripts would be blocked. Revisit if the CSP strategy changes.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "AfterDark — NYC Nightlife Marketplace",
	description:
		"AfterDark connects premium NYC venues with world-class nightlife talent — post gigs, book DJs, mixologists, security, and get paid securely.",
	icons: {
		icon: "/favicon.png",
	},
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		// AfterDark is dark-only (PRD §5): without the `dark` class, shadcn's
		// semantic tokens (bg-background, border-input, …) resolve to the light
		// palette and outline/ghost variants render white-on-white.
		<html lang="en" className="dark">
			<head>
				<link
					rel="stylesheet"
					href="/fontawesome/releases/v6.3.0/css/pro.min.css?token=2c15cc0cc7"
				/>
			</head>
			<body>
				<Providers>
					{children}
				</Providers>
			</body>
		</html>
	);
}
