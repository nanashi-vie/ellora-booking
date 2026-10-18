import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-salon-subscription-badge',
  standalone: true,
  template: `@if (label()) { <span class="subscription-badge" [class.subscription-badge--vip]="tier() === 'VIP'" [attr.title]="'Huy hiệu của gói ' + (tier() === 'VIP' ? 'VIP' : 'Thường')">{{ label() }}</span> }`,
  styles: [`
    :host { display: inline-flex; max-width: 100%; vertical-align: middle; }
    :host:empty { display: none; }
    .subscription-badge { display: inline-flex; align-items: center; border: 1px solid #ecc6d1; border-radius: 6px; padding: 4px 9px; background: #fff0f5; color: #86354e; font-size: 11px; line-height: 1.4; font-weight: 700; }
    .subscription-badge--vip { background: #7b263e; border-color: #7b263e; color: #fff6f9; }
  `]
})
export class SalonSubscriptionBadgeComponent {
  readonly tier = input<'STANDARD' | 'VIP' | null | undefined>(null);
  readonly label = computed(() => this.tier() === 'VIP' ? 'Shop đối tác' : this.tier() === 'STANDARD' ? 'Shop yêu thích' : null);
}
