import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SalonPlansComponent } from './salon-plans.component';

@Component({
  selector: 'app-for-business',
  standalone: true,
  imports: [RouterModule, SalonPlansComponent],
  templateUrl: './for-business.component.html',
  styleUrl: './for-business.component.scss'
})
export class ForBusiness {}
