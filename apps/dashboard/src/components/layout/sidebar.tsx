'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Beaker,
  Bug,
  FlaskConical,
  LayoutDashboard,
  Map,
  Play,
  Settings,
  TestTube2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const links = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/exploration/new', label: 'New exploration', icon: Play },
  { href: '/sessions', label: 'Active sessions', icon: Activity },
  { href: '/findings', label: 'Findings', icon: Beaker },
  { href: '/bug-reports', label: 'Bug reports', icon: Bug },
  { href: '/generated-tests', label: 'Generated tests', icon: TestTube2 },
  { href: '/coverage', label: 'Coverage', icon: Map },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-6 py-5">
        <FlaskConical className="h-6 w-6 text-primary" />
        <div>
          <p className="text-sm font-semibold">Exploratory QA</p>
          <p className="text-xs text-muted-foreground">Autonomous testing</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
