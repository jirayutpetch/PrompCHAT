import * as React from 'react';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '../../lib/utils';

const DropdownMenu = DropdownPrimitive.Root;
const DropdownMenuTrigger = DropdownPrimitive.Trigger;
const DropdownMenuContent = React.forwardRef<React.ElementRef<typeof DropdownPrimitive.Content>, React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>>(({ className, sideOffset = 5, ...props }, ref) => <DropdownPrimitive.Portal><DropdownPrimitive.Content ref={ref} sideOffset={sideOffset} className={cn('z-50 min-w-40 rounded-lg border border-slate-200 bg-white p-1 text-slate-700 shadow-xl', className)} {...props} /></DropdownPrimitive.Portal>);
DropdownMenuContent.displayName = DropdownPrimitive.Content.displayName;
const DropdownMenuItem = React.forwardRef<React.ElementRef<typeof DropdownPrimitive.Item>, React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item>>(({ className, ...props }, ref) => <DropdownPrimitive.Item ref={ref} className={cn('flex cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2 text-xs outline-none focus:bg-slate-100', className)} {...props} />);
DropdownMenuItem.displayName = DropdownPrimitive.Item.displayName;
export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem };
