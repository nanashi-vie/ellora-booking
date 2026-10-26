import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './button.component.html',
  styleUrl: './button.component.scss'
})
export class Button {
  variant = input<'primary' | 'secondary' | 'ghost'>('primary');
  size = input<'sm' | 'md' | 'lg' | 'full'>('md');
  type = input<'button' | 'submit' | 'reset'>('button');
  disabled = input<boolean>(false);
  customClass = input<string>('');

  computedClasses = computed(() => {
    const base = 'inline-flex items-center justify-center font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';
    
    const variants = {
      primary: 'bg-primary hover:bg-primary-hover text-white shadow-sm',
      secondary: 'bg-white text-charcoal-900 border border-charcoal-800 hover:bg-ivory-100',
      ghost: 'bg-transparent text-charcoal-900 hover:bg-ivory-100'
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-5 py-2.5 text-base',
      lg: 'px-8 py-3 text-lg',
      full: 'w-full px-5 py-3 text-base'
    };

    return `${base} ${variants[this.variant()]} ${sizes[this.size()]} ${this.customClass()}`;
  });

  onClick(event: Event) {
    if (this.disabled()) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
}
