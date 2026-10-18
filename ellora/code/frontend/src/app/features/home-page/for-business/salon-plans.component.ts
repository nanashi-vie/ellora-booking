import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SubscriptionApiService, SubscriptionPlan } from '../../../services/subscription-api.service';
import { SalonSubscriptionBadgeComponent } from '../../../shared/components/salon-subscription-badge.component';

@Component({
  selector: 'app-salon-plans',
  standalone: true,
  imports: [DecimalPipe, RouterLink, SalonSubscriptionBadgeComponent],
  templateUrl: './salon-plans.component.html',
  styleUrl: './salon-plans.component.scss'
})
export class SalonPlansComponent implements OnInit {
  private readonly api = inject(SubscriptionApiService);
  private readonly destroyRef = inject(DestroyRef);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly plans = signal<SubscriptionPlan[]>([]);
  readonly tiers = ['STANDARD', 'VIP'] as const;
  ngOnInit(): void { void this.load(); }
  plan(tier: 'STANDARD' | 'VIP'): SubscriptionPlan | undefined { return this.plans().find(plan => plan.tier === tier); }
  async load(): Promise<void> {
    this.loading.set(true); this.error.set(false);
    try {
      const plans = await this.api.plans();
      if (!this.destroyRef.destroyed) this.plans.set(plans);
    } catch {
      if (!this.destroyRef.destroyed) { this.plans.set([]); this.error.set(true); }
    } finally {
      if (!this.destroyRef.destroyed) this.loading.set(false);
    }
  }
}
