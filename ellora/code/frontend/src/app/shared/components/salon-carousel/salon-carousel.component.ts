import { Component, ElementRef, Input, ViewChild, signal, AfterViewInit, OnDestroy, NgZone, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Params, RouterModule } from '@angular/router';
import { Salon } from '../../../models/ellora.model';
import { SalonCard } from '../salon-card/salon-card.component';
import { RevealOnScrollDirective } from '../../directives/reveal-on-scroll.directive';

@Component({
  selector: 'app-salon-carousel',
  standalone: true,
  imports: [CommonModule, RouterModule, SalonCard, RevealOnScrollDirective],
  templateUrl: './salon-carousel.component.html',
  styleUrl: './salon-carousel.component.scss'
})
export class SalonCarouselComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) title!: string;
  @Input({ required: true }) viewAllLink!: string;
  @Input({ required: true }) salons: Salon[] = [];
  @Input() animateHeader = true;
  @Input() animateCards = true;
  @Input() viewAllQueryParams: Params | null = null;

  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLElement>;
  private readonly zone = inject(NgZone);
  private scrollFrame = 0;
  private carouselElement?: HTMLElement;
  private readonly handleScroll = () => {
    if (this.scrollFrame) return;
    this.scrollFrame = requestAnimationFrame(() => {
      this.scrollFrame = 0;
      this.checkScroll();
    });
  };

  canScrollLeft = signal(false);
  canScrollRight = signal(true);

  ngAfterViewInit() {
    this.carouselElement = this.scrollContainer.nativeElement;
    this.zone.runOutsideAngular(() => this.carouselElement?.addEventListener('scroll', this.handleScroll, { passive: true }));
    setTimeout(() => this.checkScroll(), 100);
  }

  ngOnDestroy(): void {
    this.carouselElement?.removeEventListener('scroll', this.handleScroll);
    if (this.scrollFrame) cancelAnimationFrame(this.scrollFrame);
  }

  checkScroll() {
    if (!this.scrollContainer) return;
    const el = this.scrollContainer.nativeElement;
    const canScrollLeft = el.scrollLeft > 0;
    const canScrollRight = Math.ceil(el.scrollLeft) < el.scrollWidth - el.clientWidth;
    if (this.canScrollLeft() !== canScrollLeft || this.canScrollRight() !== canScrollRight) {
      this.zone.run(() => {
        this.canScrollLeft.set(canScrollLeft);
        this.canScrollRight.set(canScrollRight);
      });
    }
  }

  scrollLeft() {
    if (this.scrollContainer) {
      const el = this.scrollContainer.nativeElement;
      const cardWidth = el.clientWidth > 768 ? el.clientWidth / 3 : el.clientWidth;
      el.scrollBy({ left: -cardWidth, behavior: 'smooth' });
    }
  }

  scrollRight() {
    if (this.scrollContainer) {
      const el = this.scrollContainer.nativeElement;
      const cardWidth = el.clientWidth > 768 ? el.clientWidth / 3 : el.clientWidth;
      el.scrollBy({ left: cardWidth, behavior: 'smooth' });
    }
  }
}
