/**
 * Shared Ticker Input Component
 * Auto-uppercase ticker symbol input with validation
 */

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type ChangeEvent } from 'react';

interface TickerInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  /** If true, only renders the Input without Label wrapper */
  inline?: boolean;
  /** Max length for ticker symbol */
  maxLength?: number;
}

export function TickerInput({
  value,
  onChange,
  label = 'Ticker',
  placeholder = 'AAPL',
  disabled,
  required,
  className,
  inline = false,
  maxLength = 10,
}: TickerInputProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    // Auto-uppercase and remove spaces
    const newValue = e.target.value.toUpperCase().replace(/\s/g, '');
    onChange(newValue);
  };

  const input = (
    <Input
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      className={className}
      maxLength={maxLength}
      autoCapitalize="characters"
      spellCheck={false}
    />
  );

  if (inline) {
    return input;
  }

  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {input}
    </div>
  );
}
