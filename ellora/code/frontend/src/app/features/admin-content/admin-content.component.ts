import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminContentApiService, AdminContent, AdminSalon, ContentPage } from '../../services/admin-content-api.service';
import { OwnerReview, ownerError } from '../../services/owner-api.service';
import { PhotoUpload } from '../../shared/components/photo-upload.component';

@Component({standalone:true, imports:[CommonModule,FormsModule,PhotoUpload],
  templateUrl:'./admin-content.component.html', styleUrl:'./admin-page.scss'})
export class AdminContentComponent implements OnInit {
  private api=inject(AdminContentApiService);
  salons=signal<ContentPage<AdminSalon>|null>(null);
  selected=signal<AdminContent|null>(null);
  reviews=signal<ContentPage<OwnerReview>|null>(null);
  busy=signal(false); error=signal(''); message=signal('');
  salonPage=0; reviewPage=0;
  drafts:Record<number,{rating:number;comment:string;reply:string}>={};
  ngOnInit(){void this.loadSalons(0);}
  async loadSalons(page:number){
    this.busy.set(true);this.error.set('');
    try{this.salons.set(await this.api.salons(page));this.salonPage=page;}
    catch(e){this.error.set(ownerError(e));}finally{this.busy.set(false);}
  }
  async select(id:number){
    this.busy.set(true);this.error.set('');this.message.set('');this.selected.set(null);this.reviews.set(null);this.reviewPage=0;

    try{this.selected.set(await this.api.detail(id));await this.fetchReviews(id,0);}
    catch(e){this.error.set(ownerError(e));}finally{this.busy.set(false);}
  }
  async refreshPhotos(){
    const id=this.selected()?.id;if(!id)return;
    try{const result=await this.api.detail(id);if(this.selected()?.id===id)this.selected.set(result);}
    catch(e){this.error.set(ownerError(e));}
  }
  private async fetchReviews(id:number,page:number){
    const result=await this.api.reviews(id,page);if(this.selected()?.id!==id)return;
    this.reviews.set(result);this.reviewPage=page;this.drafts={};
    for(const review of result.content)this.drafts[review.id]={rating:review.rating,comment:review.comment||'',reply:review.salonReply||''};
  }
  async moveReviews(page:number){
    const id=this.selected()?.id;if(!id)return;this.busy.set(true);this.error.set('');
    try{await this.fetchReviews(id,page);}catch(e){this.error.set(ownerError(e));}finally{this.busy.set(false);}
  }
  async moderate(review:OwnerReview,action:'edit'|'delete'|'reply'|'deleteReply'){
    const id=this.selected()?.id;if(!id||this.busy())return;
    const draft=this.drafts[review.id];
    if(action==='delete'&&!confirm('Xóa đánh giá của khách và phản hồi kèm theo? Không thể hoàn tác.'))return;
    if(action==='deleteReply'&&!confirm('Xóa phản hồi của tiệm?'))return;
    if(action==='edit'&&(!Number.isInteger(draft.rating)||draft.rating<1||draft.rating>5||draft.comment.length>1000)){
      this.error.set('Điểm từ 1 đến 5 sao, nhận xét tối đa 1000 ký tự.');return;
    }
    if(action==='reply'&&(!draft.reply.trim()||draft.reply.length>1000)){this.error.set('Phản hồi từ 1 đến 1000 ký tự.');return;}
    this.busy.set(true);this.error.set('');this.message.set('');
    try{
      if(action==='edit')await this.api.editReview(review.id,draft.rating,draft.comment);
      if(action==='delete')await this.api.deleteReview(review.id);
      if(action==='reply')await this.api.editReply(review.id,draft.reply);
      if(action==='deleteReply')await this.api.deleteReply(review.id);
      this.message.set('Đã cập nhật nội dung.');await this.fetchReviews(id,this.reviewPage);
    }catch(e){this.error.set(ownerError(e));}finally{this.busy.set(false);}
  }
}
