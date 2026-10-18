import {
  Directive,
  ChangeDetectorRef,
  ElementRef,
  HostBinding,
  Input,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  inject,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

type RevealVariant = 'fade-up' | 'fade' | 'image' | 'dashboard';

@Directive({
  selector: '[appRevealOnScroll]',
  standalone: true,
})
export class RevealOnScrollDirective implements OnInit, OnDestroy {
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly cdr = inject(ChangeDetectorRef);
  private observer?: IntersectionObserver;
  private releaseTimer?: ReturnType<typeof setTimeout>;
  private hasEntered = false;
  private hasReleasedStyles = false;
  private destroyed = false;

  @Input('appRevealOnScroll') variant: RevealVariant = 'fade-up';
  @Input() revealDelay = 0;
  @Input() revealDuration = 360;
  @Input() revealDistance = 18;

  @HostBinding('style.opacity')
  get opacity(): string {
    if (this.hasReleasedStyles) {
      return '';
    }

    return this.hasEntered ? '1' : '0';
  }

  @HostBinding('style.transform')
  get transform(): string {
    if (this.hasReleasedStyles) {
      return '';
    }

    if (this.hasEntered) {
      return 'translate3d(0, 0, 0) scale(1)';
    }

    if (this.variant === 'fade') {
      return 'none';
    }

    if (this.variant === 'image') {
      return 'scale(1.05)';
    }

    if (this.variant === 'dashboard') {
      return 'translate3d(0, 18px, 0) scale(1.035)';
    }

    return `translate3d(0, ${this.revealDistance}px, 0)`;
  }

  @HostBinding('style.transition')
  get transition(): string {
    if (this.hasReleasedStyles) {
      return '';
    }

    return [
      `opacity ${this.revealDuration}ms cubic-bezier(0.16, 1, 0.3, 1)`,
      `transform ${this.revealDuration}ms cubic-bezier(0.16, 1, 0.3, 1)`,
    ].join(', ');
  }

  @HostBinding('style.transitionDelay')
  get transitionDelay(): string {
    if (this.hasReleasedStyles) {
      return '';
    }

    return `${this.revealDelay}ms`;
  }

  @HostBinding('style.willChange')
  get willChange(): string { return this.hasReleasedStyles ? '' : 'opacity, transform'; }

  @HostBinding('class.reveal-has-entered')
  get revealHasEntered(): boolean {
    return this.hasEntered;
  }

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId) || this.prefersReducedMotion() || typeof IntersectionObserver !== 'function') {
      this.hasEntered = true;
      this.hasReleasedStyles = true;
      return;
    }

    this.observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) {
          return;
        }

        this.enter();
        this.observer?.disconnect();
      },
      {
        threshold: 0.18,
        rootMargin: '0px 0px -8% 0px',
      },
    );

    this.observer.observe(this.elementRef.nativeElement);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.observer?.disconnect();
    clearTimeout(this.releaseTimer);
  }

  private enter(): void {
    if (this.destroyed || this.hasEntered) return;
    this.hasEntered = true;
    this.cdr.markForCheck();
    this.releaseTimer = setTimeout(() => {
      if (this.destroyed) return;
      this.hasReleasedStyles = true;
      this.cdr.markForCheck();
    }, this.revealDelay + this.revealDuration + 80);
  }

  private prefersReducedMotion(): boolean {
    return typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}
