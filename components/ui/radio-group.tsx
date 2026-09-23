import * as React from 'react';
import * as RadioPrimitive from '@radix-ui/react-radio-group';
import { cn } from '../../lib/utils';

const RadioGroup = React.forwardRef<React.ElementRef<typeof RadioPrimitive.Root>, React.ComponentPropsWithoutRef<typeof RadioPrimitive.Root>>(({ className, ...props }, ref) => <RadioPrimitive.Root ref={ref} className={cn('flex flex-wrap gap-2', className)} {...props} />);
RadioGroup.displayName = RadioPrimitive.Root.displayName;
const RadioGroupItem = React.forwardRef<React.ElementRef<typeof RadioPrimitive.Item>, React.ComponentPropsWithoutRef<typeof RadioPrimitive.Item>>(({ className, children, ...props }, ref) => <RadioPrimitive.Item ref={ref} className={cn('grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-sm data-[state=checked]:border-cyan-400 data-[state=checked]:bg-cyan-50', className)} {...props}>{children}</RadioPrimitive.Item>);
RadioGroupItem.displayName = RadioPrimitive.Item.displayName;
export { RadioGroup, RadioGroupItem };
