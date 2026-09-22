import { ClipboardCheck } from "lucide-react";
import { Table, TableBody, TableRow, TableCell, TableHead } from "@/components/ui/table";

export default function PortalSupport() {
  return <div className="portal-support">
    <section className="panel support-service" aria-labelledby="support-desk-title">
      <header className="support-service-heading">
        <div className="support-title"><img src="/lark-logo.png" alt="Lark" width={48} height={48}/><div><p className="eyebrow">受講後30日間無料 / チャット相談</p><h2 id="support-desk-title">SFL Larkサポートデスク</h2></div></div>
        <span className="support-benefit">受講後30日間無料</span>
      </header>
      <div className="support-service-body">
        <h3>受講後30日間、無料でサポート。</h3>
        <p>受講後のチャット相談は、<strong>SFL Larkサポートデスク</strong>で対応します。案件探しや条件確認など、実践で迷った点をご相談いただけます。</p>
        <p>通常料金 <strong>980円</strong>のところ、<mark>受講後30日間は無料でご案内します。</mark></p>
        <Table className="support-table"><TableBody>
          <TableRow><TableHead scope="row">相談方法</TableHead><TableCell>SFL Larkサポートデスクでのチャット相談</TableCell></TableRow>
          <TableRow><TableHead scope="row">返信期限</TableHead><TableCell><strong className="support-emphasis">2営業日以内に回答</strong></TableCell></TableRow>
          <TableRow><TableHead scope="row">回答対応日時</TableHead><TableCell>月曜日〜金曜日<br/><strong>10:00〜17:00</strong>（日本時間）</TableCell></TableRow>
          <TableRow><TableHead scope="row">休業日</TableHead><TableCell>土曜日・日曜日・祝日</TableCell></TableRow>
        </TableBody></Table>
        <p className="support-note">土日祝・対応時間外にいただいたご相談は、翌営業日以降に確認し、2営業日以内に回答します。休業日にも可能な範囲で返信する場合がありますが、基本の回答対応は上記の日時となります。</p>
      </div>
    </section>
    <section className="panel support-service" aria-labelledby="bid-support-title">
      <header className="support-service-heading">
        <div className="support-title"><ClipboardCheck size={38} aria-hidden="true"/><div><p className="eyebrow">受講後の有料サポート</p><h2 id="bid-support-title">入札参加・結果確認サポート</h2></div></div>
        <span className="support-price">月額9,000円<span>（税別）</span></span>
      </header>
      <div className="support-service-body">
        <h3>参加申請から、結果の確認まで。</h3>
        <p><strong className="support-emphasis">月額9,000円（税別）</strong> / 月額9,900円（税込）</p>
        <p>受講後にご利用いただける月額制のサポートです。</p>
        <Table className="support-table"><TableBody>
          <TableRow><TableHead scope="row">入札参加申請の手続き</TableHead><TableCell>官公庁への入札参加申請を、<strong>メール・FAX</strong>で手続きします。</TableCell></TableRow>
          <TableRow><TableHead scope="row">落札結果の確認・調査</TableHead><TableCell>落札結果を確認します。<strong>落札できなかった場合も、結果や入札額を調査</strong>します。</TableCell></TableRow>
        </TableBody></Table>
        <p className="support-note">※官公庁によっては、落札結果や入札額が未公表の場合があります。確認できる範囲でご案内します。</p>
      </div>
    </section>
  </div>;
}
