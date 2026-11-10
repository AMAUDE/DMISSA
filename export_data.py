# Exporte les données de la plateforme depuis le GeoPackage QGIS (sans QGIS ouvert)
import geopandas as gpd, json, collections, shapely, numpy as np, sys
GPKG=r'C:\Users\SITC\Desktop\CLAUDE\DMISSA\OUT\Bingerville_plans_liste_excel.gpkg'
D=r'C:\Users\SITC\Desktop\CLAUDE\DMISSA\PLATEFORME\data'
s=lambda v: v.strip() if isinstance(v,str) and v.strip() not in('','NULL','nan') else None
g=gpd.read_file(GPKG,layer='plans_liste_excel')
import pandas as pd
for c in ('barcode_id','lotissement','num_ilot','num_lot','usage','classe','origine','statut_lotis','plan_approuve','arrete_approb','source'): g[c]=g[c].map(s).astype(object).where(lambda x:x.notna(),None)
g['key']=list(zip(g.barcode_id.map(lambda v:v or ''),g.lotissement.map(lambda v:v or '')))
keys=sorted(g.key.unique(),key=lambda k:(k[1].upper() if k[1] else '(SANS NOM)',k[0]))
pid={k:i+1 for i,k in enumerate(keys)}
g['pid']=g.key.map(pid)
g4=g.to_crs(4326)
T={'NORMAL':0,'REGULARISATION':1}; S={'DU':0,'DTC':1}
plans=[]; meta={}
for k in keys:
    sub=g[g.key==k]; r=sub.iloc[0]
    b=g4[g4.key==k].total_bounds
    cl=sub.classe.dropna().unique()
    conf='non_conforme' if 'non_conforme' in cl else ('conforme' if 'conforme' in cl else None)
    p=dict(id=pid[k],barcode=k[0] or None,nom=k[1] or '(sans nom)',type=r.statut_lotis or 'NON RENSEIGNÉ',source=r.source or 'Non renseigné',arrete=r.arrete_approb,appr=r.plan_approuve,origine=r.origine,nb_lots=int(len(sub)),bbox=[round(float(x),6) for x in b],conformite=conf)
    plans.append(p); meta[k]=p
json.dump(plans,open(D+r'\plans.json','w',encoding='utf8'),ensure_ascii=False)
# zones : couche QGIS « chevauchement_bon » (zones simplifiées validées)
ZG=r'C:\Users\SITC\Documents\Promotions_Bingerville\DMISSA PRESENTATION\suite\chevauchement_bon.shp'
zr_=gpd.read_file(ZG).rename(columns={'lotissemen':'lotissement_A','lotissem_1':'lotissement_B'})
total_lignes=len(zr_); sans=int(zr_.geometry.isna().sum()); zr_=zr_[zr_.geometry.notna()&~zr_.geometry.is_empty].copy()
def kk(b,n): return ((b if isinstance(b,str) else '').strip(),(n if isinstance(n,str) else '').strip())
zr_['a']=[pid.get(kk(b,n)) for b,n in zip(zr_.barcode_A,zr_.lotissement_A)]
zr_['b']=[pid.get(kk(b,n)) for b,n in zip(zr_.barcode_B,zr_.lotissement_B)]
bad=zr_[zr_.a.isna()|zr_.b.isna()|zr_.id.isna()]
if len(bad): print('zones non rattachées (ignorées) :',len(bad)); zr_=zr_.drop(bad.index)
zr_['id']=zr_['id'].astype(int)
zr_['plans']=[[int(a),int(b)] for a,b in zip(zr_.a,zr_.b)]
z4=zr_.to_crs(4326)
z={'type':'FeatureCollection','features':[{'type':'Feature','properties':{'id':int(r.id),'plans':r.plans,'conflit':True},'geometry':json.loads(shapely.to_geojson(shapely.set_precision(r.geometry,1e-6)))} for r in z4.itertuples()]}
json.dump(z,open(D+r'\zones.geojson','w'))
zg=zr_[['id','plans','geometry']].copy()
print('lignes',total_lignes,'zones valides',len(zg),'sans géométrie',sans)
zmark=collections.defaultdict(list)
sidx=g.sindex
for _,zr in zg.iterrows():
    for i in sidx.query(zr.geometry,predicate='intersects'):
        row=g.iloc[i]
        if row.pid in zr.plans:
            gm=row.geometry
            if gm.is_valid and gm.intersection(zr.geometry).area>1: zmark[i].append(int(zr.id))

def rnd(c): return [round(x,5) for x in c]
def conv(geom):
    m=shapely.geometry.mapping(geom)
    def r(c): return rnd(c) if isinstance(c[0],(int,float)) else [r(x) for x in c]
    return {'type':m['type'],'coordinates':r(m['coordinates'])}
geoms=g4.geometry.values
with open(D+r'\lots.geojson','w',encoding='utf8') as fo:
    fo.write('{"type":"FeatureCollection","features":[\n'); first=True
    for i,(idx,row) in enumerate(g.iterrows()):
        p=meta[row.key]
        pr={'p':p['id'],'t':T.get(row.statut_lotis,2),'s':S.get(row.source,2),'a':1 if row.arrete_approb else 0,'c':0 if row.classe=='non_conforme' else (1 if row.classe=='conforme' else 2)}
        if row.num_ilot: pr['i']=row.num_ilot
        if row.num_lot: pr['l']=row.num_lot
        if row.usage: pr['u']=row.usage
        if i in zmark: pr['z']='|'+'|'.join(map(str,zmark[i]))+'|'
        fo.write(('' if first else ',\n')+'{"type":"Feature","properties":'+json.dumps(pr,ensure_ascii=False,separators=(',',':'))+',"geometry":'+json.dumps(conv(geoms[i]),separators=(',',':'))+'}'); first=False
    fo.write('\n]}')
print(len(plans),len(g),len(zmark),collections.Counter(p['conformite'] for p in plans))
