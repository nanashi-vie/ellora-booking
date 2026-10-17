import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { OwnerApiService, ownerError } from '../../../services/owner-api.service';
import { SalonRegistration, SalonProfileChange } from '../../../services/salon-registration.service';
import { PhotoUpload } from '../../../shared/components/photo-upload.component';
import { SalonChangePreviewComponent } from '../../../shared/components/salon-change-preview.component';
import { WorkingHoursComponent } from './working-hours.component';

@Component({standalone:true, imports:[ReactiveFormsModule,RouterLink,PhotoUpload,SalonChangePreviewComponent,WorkingHoursComponent], styleUrl:'../owner-data.scss', template:`
<main class="owner-page" style="max-width:960px">
 <header><div><h1>Hồ sơ salon</h1><p class="muted">Thông tin giúp khách tìm và liên hệ với tiệm.</p></div><a routerLink="/owner/dashboard">Về tổng quan</a></header>
 @if(error()){<p role="alert" class="error">{{error()}}</p>}
 @if(message()){<p role="status" class="success">{{message()}}</p>}
 @if(loading()){<p role="status">Đang tải hồ sơ…</p>}
 @else if(salon();as s){
  <p class="muted">Thông tin và ảnh chỉ cập nhật sau khi Admin duyệt. Mỗi tiệm có một yêu cầu chờ duyệt tại một thời điểm.</p>
  <app-working-hours />
  @if(change();as c){
   <section class="card" aria-label="Yêu cầu cập nhật gần nhất">
    <h2>{{c.status === 'PENDING' ? 'Đang chờ Admin duyệt' : c.status === 'APPROVED' ? 'Yêu cầu gần nhất đã được duyệt' : 'Yêu cầu gần nhất bị từ chối'}}</h2>
    @if(c.status === 'PENDING'){<p>Hồ sơ đang hiển thị vẫn giữ nguyên. Bạn có thể gửi thay đổi tiếp theo sau khi Admin xử lý.</p><app-salon-change-preview [change]="c"/>}
    @if(c.status === 'REJECTED'){<p>Thông tin và ảnh cũ được giữ nguyên. Bạn có thể chỉnh sửa rồi gửi yêu cầu mới.</p><app-salon-change-preview [change]="c"/>}
    <button type="button" (click)="load()" [disabled]="saving()">Kiểm tra trạng thái</button>
   </section>
  }
  <form class="card" [formGroup]="form" (ngSubmit)="save()">
   <h2>Thông tin tiệm</h2>
   <label>Tên salon<input formControlName="name" maxlength="255" autocomplete="organization"></label>
   <label>Giới thiệu<textarea formControlName="description" maxlength="5000" rows="4"></textarea></label>
   <label>Địa chỉ<input formControlName="address" maxlength="255" autocomplete="street-address"></label>
   <div class="grid">
    <label>Tỉnh / Thành phố<input formControlName="city" maxlength="255"></label>
    <label>Quận / Huyện<input formControlName="district" maxlength="255"></label>
    <label>Số điện thoại<input type="tel" formControlName="phone" maxlength="20" autocomplete="tel"></label>
    <label>Email liên hệ<input type="email" formControlName="email" maxlength="255" autocomplete="email"></label>
   </div>
   @if(form.touched && form.invalid){<p role="alert" class="error">Điền tên, địa chỉ, tỉnh/thành và quận/huyện. Kiểm tra định dạng email và số điện thoại.</p>}
   <div class="actions"><button class="primary" type="submit" [disabled]="saving()||form.pristine||pending()">{{saving()?'Đang gửi…':'Gửi Admin duyệt'}}</button><button type="button" (click)="reset()" [disabled]="saving()||form.pristine||pending()">Hủy thay đổi</button></div>
  </form>
  <section class="card"><h2>Ảnh salon</h2><fieldset [disabled]="pending()||saving()"><app-photo-upload kind="cover" [entityId]="s.id" [imageUrl]="s.logoUrl" label="Ảnh đại diện salon" (saved)="refreshPhoto()"/></fieldset><p class="muted">Quản lý bộ sưu tập ảnh tại <a routerLink="/owner/dashboard">trang tổng quan</a>.</p></section>
 } @else {<button type="button" (click)="load()">Thử lại</button>}
</main>`})
export class SalonProfileComponent implements OnInit {
 private api=inject(OwnerApiService);
 salon=signal<SalonRegistration|null>(null);loading=signal(true);saving=signal(false);error=signal('');message=signal('');
 change=signal<SalonProfileChange|null>(null);
 pending(){return this.change()?.status === 'PENDING';}
 private required=[Validators.required,Validators.maxLength(255),Validators.pattern(/\S/)];
 form=inject(NonNullableFormBuilder).group({name:['',this.required],description:['',Validators.maxLength(5000)],address:['',this.required],city:['',this.required],district:['',this.required],phone:['',Validators.pattern(/^$|^[+0-9 ()-]{8,20}$/)],email:['',[Validators.email,Validators.maxLength(255)]]});
 ngOnInit(){void this.load();}
 reset(){const s=this.salon();if(s)this.form.reset({name:s.name,description:s.description||'',address:s.address,city:s.city,district:s.district,phone:s.phone||'',email:s.email||''});}
 async load(){this.loading.set(true);this.error.set('');try{const [salon,change]=await Promise.all([this.api.salon(),this.api.salonChange()]);this.salon.set(salon);this.change.set(change);this.reset();this.pending()?this.form.disable():this.form.enable();}catch(e){this.salon.set(null);this.error.set(ownerError(e));}finally{this.loading.set(false);}}
 async refreshPhoto(){try{this.change.set(await this.api.salonChange());if(this.pending())this.form.disable();}catch(e){this.error.set(ownerError(e));}}
 async save(){
  if(this.saving()||this.pending())return;this.form.markAllAsTouched();if(this.form.invalid)return;
  this.saving.set(true);this.error.set('');this.message.set('');this.form.disable();
  try{const v=this.form.getRawValue();this.change.set(await this.api.saveSalon({name:v.name.trim(),description:v.description.trim(),address:v.address.trim(),city:v.city.trim(),district:v.district.trim(),phone:v.phone.trim(),email:v.email.trim()}));this.reset();this.message.set('Đã gửi yêu cầu. Hồ sơ sẽ cập nhật khi Admin duyệt.');}
  catch(e){this.error.set(ownerError(e));}finally{this.saving.set(false);if(!this.pending())this.form.enable();}
 }
}
