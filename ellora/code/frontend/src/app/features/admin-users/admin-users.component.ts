import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminUsersApiService, AdminUser } from '../../services/admin-users-api.service';

@Component({standalone:true,imports:[CommonModule,FormsModule],styleUrl:'../admin-content/admin-page.scss',template:`
<section class="admin-page">
 <header class="admin-page-header"><div><h1>Quản lý người dùng</h1><p>Tra cứu tài khoản và quản lý quyền truy cập Ellora.</p></div></header>
 @if(error()){<p class="error" role="alert">{{error()}}</p>}
 @if(message()){<p class="success" role="status">{{message()}}</p>}
 <section class="card">
  <form class="actions" (ngSubmit)="search()"><label>Tìm theo tên hoặc email<input type="search" name="keyword" [(ngModel)]="keyword" maxlength="255" [disabled]="busy()"></label><button type="submit" [disabled]="busy()">Tìm kiếm</button></form>
  <p class="muted">Khóa tài khoản sẽ chặn truy cập API ngay từ yêu cầu tiếp theo. Tài khoản Admin không thể khóa tại đây.</p>
  @if(busy()){<p role="status">Đang xử lý…</p>}
  <div class="table-wrap"><table><thead><tr><th>Người dùng</th><th>Liên hệ</th><th>Vai trò</th><th>Trạng thái</th><th>Ngày tạo</th><th>Thao tác</th></tr></thead><tbody>
   @for(u of users();track u.id){<tr><td>{{u.fullName}}</td><td>{{u.email}}<p>{{u.phone||'Chưa có số điện thoại'}}</p></td><td>{{roles[u.role]}}</td><td>{{u.locked?'Đã khóa':u.enabled?'Hoạt động':'Đã vô hiệu hóa'}}</td><td>{{u.createdAt|date:'dd/MM/yyyy'}}</td><td>@if(u.role!=='ADMIN'){<button type="button" [disabled]="busy()" (click)="toggle(u)">{{u.locked?'Mở khóa':'Khóa tài khoản'}}</button>}@else{<span class="muted">Được bảo vệ</span>}</td></tr>}
   @empty{<tr><td colspan="6" class="empty">{{busy()?'Đang tải…':'Không có người dùng phù hợp.'}}</td></tr>}
  </tbody></table></div>
  <div class="pager"><button (click)="load(page-1)" [disabled]="busy()||page===0">Trang trước</button><span>Trang {{page+1}}</span><button (click)="load(page+1)" [disabled]="busy()||last">Trang sau</button></div>
 </section>
</section>`})
export class AdminUsersComponent implements OnInit {
 private api=inject(AdminUsersApiService);users=signal<AdminUser[]>([]);busy=signal(false);error=signal('');message=signal('');
 keyword='';private query='';page=0;last=true;roles={CUSTOMER:'Khách hàng',SALON_OWNER:'Chủ salon',ADMIN:'Admin'};
 ngOnInit(){void this.load();}
 search(){this.query=this.keyword.trim();void this.load(0);}
 private fail(e:unknown){this.error.set(e instanceof HttpErrorResponse&&typeof e.error?.message==='string'?e.error.message:'Không thực hiện được. Vui lòng thử lại.');}
 async load(page=0){if(this.busy())return;this.busy.set(true);this.error.set('');try{const result=await this.api.list(this.query,page);this.users.set(result.content);this.page=page;this.last=result.last;}catch(e){this.users.set([]);this.last=true;this.fail(e);}finally{this.busy.set(false);}}
 async toggle(user:AdminUser){
  if(this.busy()||user.role==='ADMIN'||!confirm((user.locked?'Mở khóa':'Khóa tài khoản')+' '+user.fullName+' ('+user.email+')?'))return;
  this.busy.set(true);this.error.set('');this.message.set('');
  try{const updated=await this.api.lock(user.id,!user.locked);this.users.update(rows=>rows.map(row=>row.id===updated.id?updated:row));this.message.set(updated.locked?'Đã khóa tài khoản.':'Đã mở khóa tài khoản.');}
  catch(e){this.fail(e);}finally{this.busy.set(false);}
 }
}
