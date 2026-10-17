import { AfterViewInit, Component, ElementRef, OnDestroy, PLATFORM_ID, ViewChild, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Header } from '../../shared/components/header/header.component';
import { Footer } from '../../shared/components/footer/footer.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, Header, Footer],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss'
})
export class MainLayout implements AfterViewInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private footerResizeObserver?: ResizeObserver;
  private footerRevealLayer?: ElementRef<HTMLElement>;
  private viewInitialized = false;

  footerRevealHeight = signal(360);

  @ViewChild('footerRevealLayer')
  private set footerRevealLayerRef(elementRef: ElementRef<HTMLElement> | undefined) {
    this.footerRevealLayer = elementRef;
    if (this.viewInitialized) {
      this.observeFooterHeight();
    }
  }

  get isHomePage(): boolean {
    return this.currentPath === '/';
  }

  get isSalonDetailPage(): boolean {
    return this.currentPath.startsWith('/salon/');
  }

  get isSearchPage(): boolean { return this.currentPath === '/search'; }

  get showHeader(): boolean {
    return !this.currentPath.startsWith('/booking');
  }

  get showFooter(): boolean {
    const path = this.currentPath;
    return path !== '/search' && !path.startsWith('/setting') && !path.startsWith('/booking');
  }

  private get currentPath(): string {
    return this.router.url.split('?')[0].split('#')[0];
  }

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    this.observeFooterHeight();
  }

  ngOnDestroy(): void {
    this.footerResizeObserver?.disconnect();
  }

  private observeFooterHeight(): void {
    this.footerResizeObserver?.disconnect();
    this.footerResizeObserver = undefined;

    if (!isPlatformBrowser(this.platformId) || !this.footerRevealLayer?.nativeElement || !this.showFooter) {
      return;
    }

    const footerElement = this.footerRevealLayer.nativeElement;
    const updateFooterHeight = () => {
      this.footerRevealHeight.set(Math.ceil(footerElement.getBoundingClientRect().height));
    };

    updateFooterHeight();
    this.footerResizeObserver = new ResizeObserver(updateFooterHeight);
    this.footerResizeObserver.observe(footerElement);
  }
}
