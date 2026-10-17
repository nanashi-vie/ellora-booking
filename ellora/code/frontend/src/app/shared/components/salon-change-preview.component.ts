import { Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SalonProfileChange, SalonProfileFields } from '../../services/salon-registration.service';

@Component({selector:'app-salon-change-preview',standalone:true,imports:[DatePipe],template:`
 <p class="date">Gửi lúc {{change().submittedAt | date:'dd/MM/yyyy HH:mm'}}</p>
 @if(change().kind === 'PROFILE') {
  <div class="table-wrap"><table>
   <thead><tr><th>Thông tin</th><th>Đang hiển thị</th><th>Đề nghị cập nhật</th></tr></thead>
   <tbody>@for(field of fields;track field.key){
    <tr [class.changed]="change().current[field.key] !== proposedValue(field.key)">
     <th scope="row">{{field.label}}</th><td>{{display(change().current[field.key])}}</td><td>{{display(proposedValue(field.key))}}</td>
    </tr>
   }</tbody>
  </table></div>
 } @else {
  <div class="photos">
   <section><h3>Ảnh đang hiển thị</h3>
    @if(change().kind === 'COVER') {
     @if(change().currentLogoUrl;as url){<img [src]="url" alt="Ảnh đại diện hiện tại">} @else {<p>Chưa có ảnh</p>}
    } @else { @for(url of change().currentImageUrls;track $index){<img [src]="url" alt="Ảnh salon hiện tại">} @empty {<p>Chưa có ảnh</p>} }
   </section>
   <section><h3>Ảnh sau khi duyệt</h3>
    @if(change().kind === 'COVER') {
     @if(change().proposedLogoUrl;as url){<img [src]="url" alt="Ảnh đại diện đề nghị">} @else {<p>Xóa ảnh đại diện</p>}
    } @else { @for(url of change().proposedImageUrls;track $index){<img [src]="url" alt="Ảnh salon đề nghị">} @empty {<p>Bộ ảnh trống</p>} }
   </section>
  </div>
 }
`,styles:[`
 :host{display:block;min-width:0}.date{color:#756b70;margin:12px 0}.table-wrap{overflow-x:auto}
 table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid #eadfe3;white-space:pre-wrap;overflow-wrap:anywhere;min-width:110px}th{font-weight:600}.changed{background:#fff5f8}
 .photos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}h3{font-weight:600;margin:12px 0}img{display:block;width:100%;max-width:260px;max-height:240px;object-fit:contain;border-radius:8px;margin:8px 0}
 @media(max-width:480px){.photos{grid-template-columns:1fr}}
`]})
export class SalonChangePreviewComponent {
 change=input.required<SalonProfileChange>();
 fields:{key:keyof SalonProfileFields;label:string}[]=[
  {key:'name',label:'Tên salon'},{key:'description',label:'Giới thiệu'},{key:'address',label:'Địa chỉ'},
  {key:'city',label:'Tỉnh / Thành phố'},{key:'district',label:'Quận / Huyện'},
  {key:'phone',label:'Số điện thoại'},{key:'email',label:'Email liên hệ'},
  {key:'latitude',label:'Vĩ độ'},{key:'longitude',label:'Kinh độ'}];
 display(value: string | number | null | undefined) { return value === null || value === undefined || value === '' ? '—' : value; }
 proposedValue(key:keyof SalonProfileFields) {
  const change=this.change();
  if((key==='latitude'||key==='longitude') && change.proposed.latitude==null && change.proposed.longitude==null) return change.current[key];
  return change.proposed[key];
 }
}
