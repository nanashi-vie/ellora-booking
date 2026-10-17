import { Component, inject, OnInit, signal } from '@angular/core';
import { SalonChangePage, SalonProfileChange, SalonRegistrationService } from '../../services/salon-registration.service';
import { SalonChangePreviewComponent } from '../../shared/components/salon-change-preview.component';
import { HttpErrorResponse } from '@angular/common/http';

@Component({selector:'app-admin-salon-changes',standalone:true,imports:[SalonChangePreviewComponent],styleUrl:'../admin-content/admin-page.scss',template:`
 <section class="admin-page" aria-label="Duyệt cập nhật hồ sơ salon">
  <header class="admin-page-header">
   <div><h1>Duyệt thông tin, ảnh và vị trí salon</h1><p>Duyệt để áp dụng thay đổi. Từ chối sẽ giữ nguyên hồ sơ đang hiển thị.</p></div>
   <button type="button" (click)="load()" [disabled]="busy()">Tải lại yêu cầu cập nhật</button>
  </header>
  @if(error()){<p role="alert" class="error">{{error()}}</p>}
  @if(message()){<p role="status" class="success">{{message()}}</p>}
  @if(busy()){<p role="status">Đang xử lý…</p>}
  @for(change of page()?.content;track change.id){
   <article class="card">
    <h2>{{change.salonName}}</h2>
    <p>{{change.kind === 'PROFILE' ? 'Thông tin tiệm' : change.kind === 'COVER' ? 'Ảnh đại diện' : 'Bộ ảnh salon'}}</p>
    <button type="button" class="underline my-3" (click)="selected.set(selected()?.id === change.id ? null : change)" [disabled]="busy()">{{selected()?.id === change.id ? 'Thu gọn' : 'Xem thay đổi'}}</button>
    @if(selected()?.id === change.id){
     <app-salon-change-preview [change]="change"/>
     <div class="actions mt-5">
      <button type="button" (click)="decide(change,'approve')" [disabled]="busy()" class="primary">Duyệt cập nhật</button>
      <button type="button" (click)="decide(change,'reject')" [disabled]="busy()" class="danger">Từ chối cập nhật</button>
     </div>
    }
   </article>
  } @empty {@if(page() && !busy()){<p>Không có yêu cầu cập nhật chờ duyệt.</p>}}
  <div class="pager">
   <button type="button" (click)="move(-1)" [disabled]="busy()||pageNumber()===0" class="disabled:opacity-40">Trang trước</button>
   <span>Trang {{pageNumber()+1}}</span>
   <button type="button" (click)="move(1)" [disabled]="busy()||!page()||page()?.last" class="disabled:opacity-40">Trang sau</button>
  </div>
 </section>
`})
export class SalonChangesComponent implements OnInit {
 private api=inject(SalonRegistrationService);
 page=signal<SalonChangePage|null>(null);pageNumber=signal(0);selected=signal<SalonProfileChange|null>(null);
 busy=signal(false);error=signal('');message=signal('');
 ngOnInit(){void this.load();}
 async load(){
  if(this.busy())return;this.busy.set(true);this.error.set('');this.selected.set(null);
  try{this.page.set(await this.api.changes(this.pageNumber()));}
  catch{this.page.set(null);this.error.set('Không tải được yêu cầu cập nhật. Vui lòng thử lại.');}
  finally{this.busy.set(false);}
 }
 async move(delta:number){this.pageNumber.update(p=>Math.max(0,p+delta));await this.load();}
 async decide(change:SalonProfileChange,action:'approve'|'reject'){
  if(this.busy())return;this.busy.set(true);this.error.set('');this.message.set('');
  try{await this.api.decideChange(change.id,action);this.pageNumber.set(0);this.message.set(action==='approve'?'Đã duyệt và cập nhật hồ sơ salon.':'Đã từ chối. Hồ sơ salon được giữ nguyên.');}
  catch(e){this.error.set(e instanceof HttpErrorResponse && typeof e.error?.message==='string'?e.error.message:'Không xử lý được yêu cầu. Vui lòng tải lại danh sách.');return;}
  finally{this.busy.set(false);}
  await this.load();
 }
}
