/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { TopBarGatewayControls } from "@/components/dashboard/top-bar-gateway-controls";
import { ThemeToggle } from "@/components/theme-toggle";
import { logout } from "@/app/actions";
import { Menu, X, Zap, LogOut } from "lucide-react";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/agent", label: "Agent" },
  { href: "/dashboard/status", label: "Status" },
  { href: "/docs", label: "Docs" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 border-b backdrop-blur-md bg-background/80">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <Zap size={16} className="text-primary" />
              <span className="font-semibold text-sm">PayGate</span>
            </Link>
            <nav className="hidden sm:flex items-center gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm px-3 py-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <TopBarGatewayControls />
            <form action={logout}>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-md border h-8 w-8 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                title="Sign out"
              >
                <LogOut size={14} />
              </button>
            </form>
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="sm:hidden inline-flex items-center justify-center rounded-md border h-8 w-8 hover:bg-muted transition-colors"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={14} /> : <Menu size={14} />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <nav className="sm:hidden border-t px-4 py-2 flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="text-sm px-3 py-2 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
