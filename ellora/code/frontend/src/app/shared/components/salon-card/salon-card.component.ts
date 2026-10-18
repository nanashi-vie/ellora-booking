import { Component, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Salon } from '../../../models/ellora.model';
import { RouterModule } from '@angular/router';
import { SalonSubscriptionBadgeComponent } from '../salon-subscription-badge.component';
import { SeasonalService } from '../../../services/seasonal.service';

@Component({
  selector: 'app-salon-card',
  standalone: true,
  imports: [CommonModule, RouterModule, SalonSubscriptionBadgeComponent],
  templateUrl: './salon-card.component.html',
  styleUrl: './salon-card.component.scss'
})
export class SalonCard {
  readonly seasons = inject(SeasonalService);
  salon = input.required<Salon>();
  variant = input<'default' | 'home'>('default');
}
