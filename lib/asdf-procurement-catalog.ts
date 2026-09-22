// Official links followed from https://www.mod.go.jp/asdf/choutatsu/ on 2026-09-16.
// A listed URL is a search route, not a claim that every notice was retrieved.
export const asdfCatalogRevision = "2026-09-16-kisarazu-acs";
type AsdfEntry = {name:string;entryUrl:string;listings:{url:string;title:string}[];note?:string};
const entries: AsdfEntry[] = [
  {
    "name": "千歳基地",
    "entryUrl": "https://www.mod.go.jp/asdf/chitose/acs/",
    "listings": [
      {
        "url": "https://www.mod.go.jp/asdf/chitose/acs/koukoku/index-8.htm",
        "title": "入札公告・公示（令和8年度）"
      }
    ]
  },
  {
    "name": "三沢基地",
    "entryUrl": "https://www.mod.go.jp/asdf/misawa/offer/public_offering/public_offering.html",
    "listings": [
      {
        "url": "https://www.mod.go.jp/asdf/misawa/offer/public_offering/nyusatsu.html",
        "title": "入札公告"
      },
      {
        "url": "https://www.mod.go.jp/asdf/misawa/offer/public_offering/kouji.html",
        "title": "公示"
      },
      {
        "url": "https://www.mod.go.jp/asdf/misawa/offer/public_offering/opencounter.html",
        "title": "オープンカウンター"
      }
    ]
  },
  {
    "name": "秋田分屯基地",
    "entryUrl": "https://www.mod.go.jp/asdf/akita/sp/choutatsu/choutatsuindex.html",
    "listings": []
  },
  {
    "name": "松島基地",
    "entryUrl": "https://www.mod.go.jp/asdf/matsushima/tyotatu/index.html",
    "listings": [
      {
        "url": "https://www.mod.go.jp/asdf/matsushima/tyotatu/nyusatu/index.html",
        "title": "入札公告"
      },
      {
        "url": "https://www.mod.go.jp/asdf/matsushima/tyotatu/open/index.html",
        "title": "オープンカウンター"
      }
    ]
  },
  {
    "name": "新潟分屯基地",
    "entryUrl": "https://www.mod.go.jp/asdf/niigata/procurement/third/index.html",
    "listings": []
  },
  {
    "name": "百里基地",
    "entryUrl": "https://www.mod.go.jp/asdf/hyakuri/acs/2-7_procurement/2-7_procurement.html",
    "listings": []
  },
  {
    "name": "木更津分屯基地",
    "entryUrl": "https://www.mod.go.jp/asdf/kisarazu/acs/index.html",
    "listings": [{"url":"https://www.mod.go.jp/asdf/kisarazu/acs/index.html","title":"入札情報・オープンカウンター"}]
  },
  {
    "name": "十条基地",
    "entryUrl": "https://www.mod.go.jp/asdf/2dep/jyujyo/mpd/",
    "listings": [],
    "note": "公式の入口URLはHTTP 403で取得できませんでした。案件がないという意味ではありません。"
  },
  {
    "name": "市ヶ谷基地",
    "entryUrl": "https://www.mod.go.jp/asdf/ichigaya/",
    "listings": [],
    "note": "入口ページは確認。表示用テンプレートのみで、公告本文は今回の調査では未確認です。"
  },
  {
    "name": "目黒基地",
    "entryUrl": "https://www.mod.go.jp/asdf/meguro/choutatsu/choutatsu.html",
    "listings": []
  },
  {
    "name": "府中基地",
    "entryUrl": "https://www.mod.go.jp/asdf/fuchu/",
    "listings": [
      {
        "url": "https://www.mod.go.jp/asdf/fuchu/acs/choutatsu/index.html",
        "title": "入札公告"
      },
      {
        "url": "https://www.mod.go.jp/asdf/fuchu/acs/open/index.html",
        "title": "オープンカウンター"
      }
    ]
  },
  {
    "name": "横田基地",
    "entryUrl": "https://www.mod.go.jp/asdf/yokota/chotatu.html",
    "listings": []
  },
  {
    "name": "入間基地",
    "entryUrl": "https://www.mod.go.jp/asdf/iruma/bosyu/raising/index.html",
    "listings": [
      {
        "url": "https://www.mod.go.jp/asdf/iruma/bosyu/raising/index6.html",
        "title": "入札公告"
      },
      {
        "url": "https://www.mod.go.jp/asdf/iruma/bosyu/raising/index7.html",
        "title": "オープンカウンター"
      }
    ]
  },
  {
    "name": "熊谷基地",
    "entryUrl": "https://www.mod.go.jp/asdf/kumagaya/procurement_info.html",
    "listings": []
  },
  {
    "name": "静浜基地",
    "entryUrl": "https://www.mod.go.jp/asdf/shizuhama/choutatsu/choutatsu.html",
    "listings": []
  },
  {
    "name": "浜松基地",
    "entryUrl": "https://www.mod.go.jp/asdf/hamamatsu/choutatsu/",
    "listings": []
  },
  {
    "name": "小牧基地",
    "entryUrl": "https://www.mod.go.jp/asdf/komaki/tyoutatu/chotatsu/chotatsu.htm",
    "listings": [],
    "note": "フレーム形式の入口です。個別の公告本文は今回の調査では未確認です。"
  },
  {
    "name": "岐阜基地",
    "entryUrl": "https://www.mod.go.jp/asdf/gifu/acd/",
    "listings": [
      {
        "url": "https://www.mod.go.jp/asdf/gifu/acd/sub1.html",
        "title": "入札情報・オープンカウンター・公示"
      }
    ]
  },
  {
    "name": "小松基地",
    "entryUrl": "https://www.mod.go.jp/asdf/komatsu/6/6.html",
    "listings": [],
    "note": "入口ページは確認。コンテンツ一覧から公告本文を読み取れず、個別の掲載先は未確認です。"
  },
  {
    "name": "奈良基地",
    "entryUrl": "https://www.mod.go.jp/asdf/nara/05procurement/",
    "listings": [
      {
        "url": "https://www.mod.go.jp/asdf/nara/05procurement/02tenderring/index.html",
        "title": "入札情報・オープンカウンター"
      }
    ]
  },
  {
    "name": "美保基地",
    "entryUrl": "https://www.mod.go.jp/asdf/miho/kaikeitai_tyoutatu/choutatujouhou.html",
    "listings": []
  },
  {
    "name": "防府北基地",
    "entryUrl": "https://www.mod.go.jp/asdf/hofukita/choutatsu/index_choutatsu.html",
    "listings": [],
    "note": "公式ページに公告・PDFリンクがありますが、今回の調査では文字化けにより内容の確認が不十分です。"
  },
  {
    "name": "防府南基地",
    "entryUrl": "https://www.mod.go.jp/asdf/hofuminami/tyotatsu.html",
    "listings": []
  },
  {
    "name": "築城基地",
    "entryUrl": "https://www.mod.go.jp/asdf/tsuiki/choutatsu.html",
    "listings": [
      {
        "url": "https://www.mod.go.jp/asdf/tsuiki/choutatsu/nyuusatujyouhou/nyuusatsujyouhou.html",
        "title": "入札公告"
      },
      {
        "url": "https://www.mod.go.jp/asdf/tsuiki/choutatsu/open_counter.html",
        "title": "オープンカウンター"
      }
    ]
  },
  {
    "name": "芦屋基地",
    "entryUrl": "https://www.mod.go.jp/asdf/ashiya/choutatsu/",
    "listings": [
      {
        "url": "https://www.mod.go.jp/asdf/ashiya/choutatsu/kaikei/nyuusatu/25/R7nyuusatsu.pdf",
        "title": "入札公告"
      },
      {
        "url": "https://www.mod.go.jp/asdf/ashiya/choutatsu/kaikei/R3opencounter/R3opencounter.pdf",
        "title": "オープンカウンター"
      }
    ],
    "note": "入札・オープンカウンターは一覧PDFに掲載されています。一覧内の公式リンクをたどり、個別資料を確認します。"
  },
  {
    "name": "春日基地",
    "entryUrl": "https://www.mod.go.jp/asdf/kasuga/second/bosyu.html",
    "listings": [
      {
        "url": "https://www.mod.go.jp/asdf/kasuga/second/kaikei/4a-bid-announcement8nendo.htm",
        "title": "入札公告"
      },
      {
        "url": "https://www.mod.go.jp/asdf/kasuga/second/kaikei/seifutyoutatsu8nendo.htm",
        "title": "政府調達"
      },
      {
        "url": "https://www.mod.go.jp/asdf/kasuga/second/kaikei/provisions4-8nendo.htm",
        "title": "糧食入札"
      },
      {
        "url": "https://www.mod.go.jp/asdf/kasuga/second/kaikei/OC8nendo.htm",
        "title": "オープンカウンター"
      }
    ]
  },
  {
    "name": "新田原基地",
    "entryUrl": "https://www.mod.go.jp/asdf/nyutabaru/08cyoutatsu/",
    "listings": []
  },
  {
    "name": "那覇基地",
    "entryUrl": "https://www.mod.go.jp/asdf/naha/acs/",
    "listings": [],
    "note": "入口ページと調達担当基地一覧は確認。個別の公告本文・掲載先は今回の調査では未確認です。"
  }
];
export const asdfProcurementCatalog = entries.map(entry=>({...entry,listingUrls:entry.listings.map(listing=>listing.url)}));
