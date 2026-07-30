'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import {
  LayoutDashboard,
  Calendar,
  MessageSquare,
  User,
  Building2,
  PlusCircle,
  Users,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Zap,
  Search,
  Briefcase,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type DashboardRole = 'talent' | 'venue';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavLink {
  kind: 'link';
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
}

interface NavGroup {
  kind: 'group';
  id: string;
  label: string;
  icon: React.ReactNode;
  children: NavLink[];
}

type SidebarItem = NavLink | NavGroup;

// ─── Nav definitions ──────────────────────────────────────────────────────────

const TALENT_NAV: SidebarItem[] = [
  {
    kind: 'link',
    label: 'Dashboard',
    href: '/dashboard/talent',
    icon: <LayoutDashboard className="w-5 h-5" />,
  },
  {
    kind: 'group',
    id: 'gigs',
    label: 'Gigs',
    icon: <Briefcase className="w-5 h-5" />,
    children: [
      {
        kind: 'link',
        label: 'Browse Gigs',
        href: '/dashboard/talent/browse',
        icon: <Search className="w-4 h-4" />,
      },
      {
        kind: 'link',
        label: 'My Applications',
        href: '/dashboard/talent/applicants',
        icon: <Users className="w-4 h-4" />,
      },
    ],
  },
  {
    kind: 'link',
    label: 'My Schedule',
    href: '/dashboard/talent/schedule',
    icon: <Calendar className="w-5 h-5" />,
  },
  {
    kind: 'link',
    label: 'Messages',
    href: '/dashboard/talent/messages',
    icon: <MessageSquare className="w-5 h-5" />,
  },
  {
    kind: 'link',
    label: 'My Profile',
    href: '/dashboard/talent/profile',
    icon: <User className="w-5 h-5" />,
  },
];

const VENUE_NAV: SidebarItem[] = [
  {
    kind: 'link',
    label: 'Dashboard',
    href: '/dashboard/venue',
    icon: <LayoutDashboard className="w-5 h-5" />,
  },
  {
    kind: 'group',
    id: 'gigs',
    label: 'Gigs',
    icon: <Briefcase className="w-5 h-5" />,
    children: [
      {
        kind: 'link',
        label: 'Post a Gig',
        href: '/dashboard/venue/create-gig',
        icon: <PlusCircle className="w-4 h-4" />,
      },
      {
        kind: 'link',
        label: 'Browse Gigs',
        href: '/dashboard/venue/browse',
        icon: <Search className="w-4 h-4" />,
      },
      {
        kind: 'link',
        label: 'Applicants',
        href: '/dashboard/venue/applicants',
        icon: <Users className="w-4 h-4" />,
      },
    ],
  },
  {
    kind: 'link',
    label: 'Gig Calendar',
    href: '/dashboard/venue/schedule',
    icon: <Calendar className="w-5 h-5" />,
  },
  {
    kind: 'link',
    label: 'Messages',
    href: '/dashboard/venue/messages',
    icon: <MessageSquare className="w-5 h-5" />,
  },
  {
    kind: 'link',
    label: 'Analytics',
    href: '/dashboard/venue/analytics',
    icon: <BarChart3 className="w-5 h-5" />,
  },
  {
    kind: 'link',
    label: 'Venue Profile',
    href: '/dashboard/venue/profile',
    icon: <Building2 className="w-5 h-5" />,
  },
];

// ─── Shared nav renderers ─────────────────────────────────────────────────────

function NavLinkItem({
  item,
  isChild,
  collapsed,
  active,
  onClick,
}: {
  item: NavLink;
  isChild?: boolean;
  collapsed?: boolean;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group border',
        active
          ? 'bg-[#00FFCC]/10 text-[#00FFCC] border-[#00FFCC]/20'
          : 'text-white/50 hover:text-white hover:bg-white/5 border-transparent',
        collapsed && !isChild && 'justify-center',
        isChild && !collapsed && 'pl-9'
      )}
    >
      <span
        className={cn(
          'flex-shrink-0',
          active ? 'text-[#00FFCC]' : 'text-white/40 group-hover:text-white'
        )}
      >
        {item.icon}
      </span>
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && item.badge && (
        <span className="bg-[#00FFCC] text-black text-[10px] font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

// ─── Mobile Drawer ─────────────────────────────────────────────────────────────

function MobileDrawer({
  open,
  onClose,
  role,
  navItems,
  displayName,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  role: DashboardRole;
  navItems: SidebarItem[];
  displayName: string;
  pathname: string;
}) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  // Lock body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Auto-open groups containing active route
  useEffect(() => {
    const activeGroupIds = navItems
      .filter((i): i is NavGroup => i.kind === 'group')
      .filter((g) => g.children.some((c) => pathname === c.href))
      .map((g) => g.id);
    if (activeGroupIds.length > 0) setOpenGroups(new Set(activeGroupIds));
  }, [pathname, navItems]);

  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="absolute left-0 top-0 bottom-0 w-[280px] bg-[#0A0A0A] border-r border-white/5 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-white/5 flex-shrink-0">
          <Link
            href="/"
            onClick={onClose}
            className="text-xl font-black tracking-tighter text-[#00FFCC]"
          >
            AFTERDARK
          </Link>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User badge */}
        <div className="px-3 pt-4 pb-2 flex-shrink-0">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/5">
            <div className="w-8 h-8 rounded-full bg-[#00FFCC]/20 flex items-center justify-center flex-shrink-0">
              {role === 'talent' ? (
                <Zap className="w-4 h-4 text-[#00FFCC]" />
              ) : (
                <Building2 className="w-4 h-4 text-[#00FFCC]" />
              )}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white leading-none truncate">{displayName}</p>
              <p className="text-[10px] text-white/40 mt-0.5 capitalize">{role}</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {navItems.map((item) => {
            if (item.kind === 'link') {
              return (
                <NavLinkItem
                  key={item.href}
                  item={item}
                  active={pathname === item.href}
                  onClick={onClose}
                />
              );
            }
            const isOpen = openGroups.has(item.id);
            const hasActiveChild = item.children.some((c) => pathname === c.href);
            return (
              <div key={item.id}>
                <button
                  onClick={() => toggleGroup(item.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border',
                    hasActiveChild
                      ? 'text-[#00FFCC] border-[#00FFCC]/10 bg-[#00FFCC]/5'
                      : 'text-white/50 hover:text-white hover:bg-white/5 border-transparent'
                  )}
                >
                  <span
                    className={cn(
                      'flex-shrink-0',
                      hasActiveChild ? 'text-[#00FFCC]' : 'text-white/40'
                    )}
                  >
                    {item.icon}
                  </span>
                  <span className="flex-1 text-left font-semibold">{item.label}</span>
                  <ChevronDown
                    className={cn(
                      'w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200',
                      isOpen && 'rotate-180',
                      hasActiveChild ? 'text-[#00FFCC]/60' : 'text-white/20'
                    )}
                  />
                </button>
                {isOpen && (
                  <div className="mt-0.5 space-y-0.5 relative">
                    <div className="absolute left-[22px] top-1 bottom-1 w-px bg-white/8" />
                    {item.children.map((child) => (
                      <NavLinkItem
                        key={child.href}
                        item={child}
                        isChild
                        active={pathname === child.href}
                        onClick={onClose}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="mx-3 border-t border-white/5" />
        <div className="px-2 py-3 space-y-0.5 flex-shrink-0">
          <Link
            href={`/dashboard/settings?role=${role}`}
            onClick={onClose}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border',
              pathname === '/dashboard/settings'
                ? 'text-[#00FFCC] bg-[#00FFCC]/10 border-[#00FFCC]/20'
                : 'text-white/40 hover:text-white hover:bg-white/5 border-transparent'
            )}
          >
            <Settings className="w-5 h-5 flex-shrink-0" />
            <span>Settings</span>
          </Link>
          <Link
            href="/account/logout"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/40 hover:text-red-400 hover:bg-red-400/5 transition-all border border-transparent"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span>Sign Out</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface DashboardSidebarProps {
  role: DashboardRole;
  userName?: string;
}

export default function DashboardSidebar({ role, userName }: DashboardSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const navItems = role === 'talent' ? TALENT_NAV : VENUE_NAV;
  // Real identity from the session — no more hardcoded demo names (Backlog #12).
  const { data: session } = authClient.useSession();
  const displayName =
    userName ?? session?.user?.name ?? (role === 'talent' ? 'Talent' : 'Venue');

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const activeGroupIds = navItems
    .filter((i): i is NavGroup => i.kind === 'group')
    .filter((g) => g.children.some((c) => pathname === c.href))
    .map((g) => g.id);

  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(activeGroupIds));

  useEffect(() => {
    if (activeGroupIds.length > 0) {
      setOpenGroups((prev) => {
        const next = new Set(prev);
        activeGroupIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleGroup = (id: string) => {
    if (collapsed) {
      setCollapsed(false);
      setOpenGroups(new Set([id]));
      return;
    }
    setOpenGroups((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  return (
    <>
      {/* ─── Mobile top bar (fixed, sits above page content) ─── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-[#0A0A0A]/95 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-4">
        <Link href="/" className="text-xl font-black tracking-tighter text-[#00FFCC]">
          AFTERDARK
        </Link>
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors border border-white/5"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* ─── Mobile slide-in drawer ─── */}
      <MobileDrawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        role={role}
        navItems={navItems}
        displayName={displayName}
        pathname={pathname}
      />

      {/* ─── Desktop sidebar ─── */}
      <aside
        className={cn(
          'hidden md:flex flex-col h-screen sticky top-0 bg-[#0A0A0A] border-r border-white/5 transition-all duration-300 flex-shrink-0',
          collapsed ? 'w-[72px]' : 'w-64'
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-white/5 flex-shrink-0">
          {!collapsed ? (
            <Link href="/" className="text-xl font-black tracking-tighter text-[#00FFCC] flex-1">
              AFTERDARK
            </Link>
          ) : (
            <Link href="/" className="text-[#00FFCC] font-black text-xl mx-auto">
              A
            </Link>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-white/30 hover:text-white transition-colors flex-shrink-0"
            aria-label="Toggle sidebar"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* User Badge */}
        {!collapsed && (
          <div className="px-3 pt-4 pb-2">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/5">
              <div className="w-8 h-8 rounded-full bg-[#00FFCC]/20 flex items-center justify-center flex-shrink-0">
                {role === 'talent' ? (
                  <Zap className="w-4 h-4 text-[#00FFCC]" />
                ) : (
                  <Building2 className="w-4 h-4 text-[#00FFCC]" />
                )}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-white leading-none truncate">{displayName}</p>
                <p className="text-[10px] text-white/40 mt-0.5 capitalize">{role}</p>
              </div>
            </div>
          </div>
        )}

        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {navItems.map((item) => {
            if (item.kind === 'link') {
              return (
                <NavLinkItem
                  key={item.href}
                  item={item}
                  collapsed={collapsed}
                  active={pathname === item.href}
                />
              );
            }
            const isOpen = openGroups.has(item.id);
            const hasActiveChild = item.children.some((c) => pathname === c.href);
            return (
              <div key={item.id}>
                <button
                  onClick={() => toggleGroup(item.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border',
                    hasActiveChild
                      ? 'text-[#00FFCC] border-[#00FFCC]/10 bg-[#00FFCC]/5'
                      : 'text-white/50 hover:text-white hover:bg-white/5 border-transparent',
                    collapsed && 'justify-center'
                  )}
                >
                  <span
                    className={cn(
                      'flex-shrink-0',
                      hasActiveChild ? 'text-[#00FFCC]' : 'text-white/40'
                    )}
                  >
                    {item.icon}
                  </span>
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left font-semibold">{item.label}</span>
                      <ChevronDown
                        className={cn(
                          'w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200',
                          isOpen && 'rotate-180',
                          hasActiveChild ? 'text-[#00FFCC]/60' : 'text-white/20'
                        )}
                      />
                    </>
                  )}
                </button>
                {isOpen && !collapsed && (
                  <div className="mt-0.5 space-y-0.5 relative">
                    <div className="absolute left-[22px] top-1 bottom-1 w-px bg-white/8" />
                    {item.children.map((child) => (
                      <NavLinkItem
                        key={child.href}
                        item={child}
                        isChild
                        collapsed={false}
                        active={pathname === child.href}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="mx-3 border-t border-white/5" />

        {/* Bottom Actions */}
        <div className="px-2 py-3 space-y-0.5">
          <Link
            href={`/dashboard/settings?role=${role}`}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:text-white hover:bg-white/5 transition-all border border-transparent',
              pathname === '/dashboard/settings'
                ? 'text-[#00FFCC] bg-[#00FFCC]/10 border-[#00FFCC]/20'
                : 'text-white/40',
              collapsed && 'justify-center'
            )}
          >
            <Settings className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>Settings</span>}
          </Link>
          <Link
            href="/account/logout"
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/40 hover:text-red-400 hover:bg-red-400/5 transition-all border border-transparent',
              collapsed && 'justify-center'
            )}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </Link>
        </div>
      </aside>
    </>
  );
}
