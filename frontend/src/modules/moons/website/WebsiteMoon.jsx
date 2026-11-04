import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ExternalLink, Globe, ImagePlus, LayoutTemplate, Menu, Monitor, Paintbrush, Rocket, Save, Smartphone } from 'lucide-react'
import { api } from '../../../api/client'
import { MoonsSidebar } from '../MoonsSidebar'
import PremiumOptions from './PremiumOptions'
import MenuReview from './MenuReview'
import './website.css'

const ROOT = '/api/moons/website'
const steps = ['Template', 'Basic Edit', 'Publish']
function TemplateArt({ template }) {
  if(template==='premium-restaurant')return <img className="website-template-thumbnail" src="/website-templates/premium-restaurant/preview.webp" alt="Premium restaurant template preview"/>
  return <div className={`website-template-art ${template}`} aria-hidden="true"><div className="website-art-nav"><span /><i /><i /></div><div className="website-art-content"><div><small>YOUR NEXT CHAPTER</small><strong>Make yourself<br />at home.</strong><span className="website-art-line" /><span className="website-art-line short" /><b>Say hello ↗</b></div><div className="website-art-photo">✳</div></div></div>
}
function DraftVisual({ configuration: c }) {
  return <div className={`website-draft-visual ${c.template}`} style={{ '--site-primary': c.primaryColor, '--site-secondary': c.secondaryColor, background: c.backgroundColor, color: c.textColor }}><header>{c.logo && <img src={`${ROOT}/assets/${c.logo}`} alt="Business logo" />}<strong>{c.businessName}</strong><span>Get in touch</span></header><section><div><small>{c.tagline}</small><h2>{c.heroHeading}</h2><p>{c.heroDescription}</p><span className="website-visual-cta">Visit us ↗</span></div>{c.heroImage ? <img className="website-visual-image" src={`${ROOT}/assets/${c.heroImage}`} alt="Hero" /> : <div className="website-visual-placeholder">✳</div>}</section>{c.menuItems?.length>0&&<section className="website-menu-visual"><div><h3>Our menu</h3>{c.menuItems.slice(0,4).map((item,index)=><p key={index}>{item.name} ? {c.menuCurrency} {item.price}</p>)}</div></section>}<footer><strong>Come say hello.</strong><p>{c.address}</p><p>{c.phone} {c.email}</p></footer></div>
}
export default function WebsiteMoon() {
  const [data, setData] = useState(null)
  const [configuration, setConfiguration] = useState(null)
  const [subdomain, setSubdomain] = useState('')
  const [step, setStep] = useState(0)
  const [drawer, setDrawer] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [mobile, setMobile] = useState(false)
  const [preview, setPreview] = useState(false)
  const [livePreviewHtml,setLivePreviewHtml]=useState('')
  const [previewError,setPreviewError]=useState('')
  const [user, setUser] = useState(null)
  useEffect(() => {
    let active = true
    Promise.all([api(ROOT), api('/api/auth/me')]).then(([result, auth]) => {
      if (!active) return
      setData(result); setConfiguration(result.website?.configuration || result.defaults); setSubdomain(result.website?.subdomain || ''); setUser(auth.user)
      if (result.website) setStep(2)
    }).catch(err => { if (active) { if (err.status === 401) window.location.assign('/app/login'); else setError(err.message) } })
    return () => { active = false }
  }, [])
  useEffect(()=>{
    if(configuration?.template!=='premium-restaurant')return
    const controller=new AbortController()
    const timer=setTimeout(()=>{api(ROOT+'/render-preview',{method:'POST',body:configuration,signal:controller.signal}).then(result=>{setLivePreviewHtml(result.html);setPreviewError('')}).catch(error=>{if(error.name!=='AbortError')setPreviewError(error.message)})},300)
    return()=>{clearTimeout(timer);controller.abort()}
  },[configuration])
  const website = data?.website
  const canEdit = data?.permissions.includes('website.edit')
  const canPublish = data?.permissions.includes('website.publish')
  const dirty = data && (JSON.stringify(configuration) !== JSON.stringify(website?.configuration || data.defaults) || subdomain !== (website?.subdomain || ''))
  useEffect(() => {
    const warn = event => { if (dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  function selectTemplate(template) {setPreview(false);setNotice('');setConfiguration(current=>({...current,...(!website&&template.preset?template.preset:{}),template:template.id}))}
  function change(field, value) { setPreview(false); setConfiguration(current => ({ ...current, [field]: value })); setNotice('') }
  async function saveDraft() {
    const result = await api(`${ROOT}/draft`, { method: 'PUT', body: { revision: website?.revision || 0, subdomain, configuration } })
    setData(current => ({ ...current, website: result })); setConfiguration(result.configuration); setSubdomain(result.subdomain)
    return result
  }
  async function act(action) {
    setBusy(true); setError(''); setNotice('')
    try {
      if (action === 'save') { await saveDraft(); setNotice('Draft saved. Your published website is unchanged.') }
      if (action === 'preview') { if (dirty || !website) await saveDraft(); setPreview(true); setStep(1); setNotice('Private preview of your saved draft.') }
      if (action === 'publish') {
        const current = dirty || !website ? await saveDraft() : website
        const result = await api(`${ROOT}/publish`, { method: 'POST', body: { revision: current.revision } })
        setData(state => ({ ...state, website: result })); setNotice('Your website is published.'); setStep(2)
      }
      if (action === 'unpublish') {
        const result = await api(`${ROOT}/unpublish`, { method: 'POST', body: { revision: website.revision } })
        setData(state => ({ ...state, website: result })); setNotice('Your website is unpublished. Your draft is preserved.')
      }
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  async function importMenu() {
    setBusy(true);setError('');setPreview(false)
    try { const result=await api(ROOT+'/menu-import',{method:'POST'});setConfiguration(current=>({...current,menuItems:result.menuItems,menuCurrency:result.menuCurrency}));setNotice(result.hasMore?'Imported the first 100 menu entries. Review them before publishing.':'Menu imported into your draft. Review and publish when ready.') }
    catch(err){setError(err.message)}finally{setBusy(false)}
  }
  async function upload(field, file) {
    if (!file) return
    setBusy(true); setError('')
    try {
      const form = new FormData(); form.append('image', file)
      const response = await fetch(`${ROOT}/assets`, { method: 'POST', credentials: 'include', body: form })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Image upload failed.')
      if(typeof field==='number'){setPreview(false);setConfiguration(current=>({...current,menuItems:current.menuItems.map((item,index)=>index===field?{...item,image:result.id}:item)}))}else change(field, result.id); setNotice('Image uploaded. Save your draft to keep this change.')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  function input(field, label, limit, type = 'text') {
    return <label className="website-field" key={field}><span>{label}</span>{type === 'textarea' ? <textarea maxLength={limit} value={configuration[field]} disabled={!canEdit || busy} onChange={event => change(field, event.target.value)} rows={3} /> : <input type={type} maxLength={limit} value={configuration[field]} disabled={!canEdit || busy} onChange={event => change(field, event.target.value)} />}</label>
  }
  const nav = [{ key: 'website', label: 'Website Moon', icon: <Globe size={19} />, onClick: () => setStep(2) }, ...steps.map((label, index) => ({ key: String(index), label, icon: index === 0 ? <LayoutTemplate size={19} /> : index === 1 ? <Paintbrush size={19} /> : <Rocket size={19} />, onClick: () => setStep(index) }))]
  return <div className="marketplace website-moon"><MoonsSidebar user={user} label="Website Moon" items={nav} activeId={String(step)} drawerOpen={drawer} onClose={() => setDrawer(false)} /><main className="website-workspace"><header className="website-topbar"><button className="website-mobile-nav" aria-label="Open navigation" onClick={() => setDrawer(true)}><Menu size={21} /></button><a href="/app/moons"><ArrowLeft size={16} /> All Moons</a><span><Globe size={16} /> Website Moon</span><span className="website-status">{website?.status === 'published' ? '● Live' : '○ Draft'}</span></header>
    <section className="website-page-heading"><div className="website-eyebrow">YOUR BUSINESS, A LITTLE MORE CONNECTED</div><h1>Your place on the web.</h1><p>Choose a look. Make it yours. Welcome the world.</p></section>
    <nav className="website-steps" aria-label="Website setup">{steps.map((label, index) => <button key={label} className={step === index ? 'active' : ''} aria-current={step === index ? 'step' : undefined} onClick={() => setStep(index)}><span>{index + 1}</span>{label}</button>)}</nav>
    {error && <div className="website-message error" role="alert">{error}<button onClick={() => window.location.reload()}>Reload</button></div>}{notice && <div className="website-message" role="status">{notice}</div>}
    {!data ? <section className="website-skeleton" aria-busy="true" aria-label="Loading Website Moon"><div /><div /><div /></section> : <>
      {step === 0 && <section><div className="website-section-heading"><div><h2>A starting point that feels like you.</h2><p>Every template adapts to your brand, on every screen.</p></div><span>{data.templates.length} curated templates</span></div><div className="website-template-grid">{data.templates.map(template => <button key={template.id} className={`website-template-card ${configuration.template === template.id ? 'selected' : ''}`} disabled={!canEdit || busy} aria-pressed={configuration.template === template.id} onClick={() => selectTemplate(template)}><TemplateArt template={template.id} /><div><h3>{template.name}{configuration.template === template.id && <Check size={19} />}</h3><p>{template.description}</p></div></button>)}</div><div className="website-bottom-actions"><span>You can switch templates before publishing.</span><button className="website-primary" onClick={() => setStep(1)}>Make it yours <ArrowRight size={17} /></button></div></section>}
      {step === 1 && <div className="website-editor-grid"><section className="website-editor-panel"><h2>The details make it yours.</h2><p>Your changes stay private until you publish.</p><fieldset disabled={!canEdit || busy}><legend>Branding</legend>{input('businessName', 'Business name', 100)}{input('tagline', 'Tagline', 160)}{['logo', 'heroImage'].map(field => <div className="website-upload" key={field}><label><ImagePlus size={19} />{field === 'logo' ? 'Business logo' : 'Hero image'}<input type="file" accept="image/jpeg,image/png,image/webp" aria-label={field === 'logo' ? 'Upload logo' : 'Upload hero image'} onChange={event => { upload(field, event.target.files?.[0]); event.target.value = '' }} /></label><small>JPEG, PNG or WebP · up to 5 MB</small>{configuration[field] && <button type="button" onClick={() => change(field, '')}>Remove image</button>}</div>)}</fieldset><fieldset disabled={!canEdit || busy}><legend>Appearance</legend><div className="website-color-grid">{[['primaryColor','Primary'],['secondaryColor','Secondary'],['backgroundColor','Background'],['textColor','Text']].map(([field, label]) => <label key={field}><span>{label}</span><div><input type="color" aria-label={`${label} color`} value={configuration[field]} onChange={event => change(field, event.target.value)} /><code>{configuration[field]}</code></div></label>)}</div></fieldset><fieldset disabled={!canEdit || busy}><legend>Homepage</legend>{input('heroHeading', 'Hero heading', 160, 'textarea')}{input('heroDescription', 'Hero description', 1500, 'textarea')}</fieldset>{configuration.template==='premium-restaurant'&&<PremiumOptions configuration={configuration} change={change} disabled={!canEdit||busy}/>}<fieldset disabled={!canEdit || busy}><legend>Public menu</legend><p className="website-preview-note">Import your existing menu into this draft. Prices change on the public website only when you publish again.</p><button type="button" onClick={importMenu}>Import current menu</button><p>{configuration.menuItems.length} menu entries ? {configuration.menuCurrency}</p><MenuReview items={configuration.menuItems} currency={configuration.menuCurrency} photoOptions={data.menuPhotoOptions} change={change} upload={upload} disabled={!canEdit||busy}/></fieldset><fieldset disabled={!canEdit || busy}><legend>Contact</legend>{input('phone', 'Phone number', 40, 'tel')}{input('email', 'Business email', 254, 'email')}{input('address', 'Address', 500, 'textarea')}<label className="website-field"><span>Social links</span><textarea rows={3} placeholder="One HTTPS social profile URL per line" value={configuration.socialUrls.join('\n')} onChange={event => change('socialUrls', event.target.value.split('\n').slice(0, 6))} /><small>Facebook, Instagram, TikTok, YouTube, X or LinkedIn.</small></label></fieldset></section><aside className="website-preview-panel"><div className="website-preview-toolbar"><span>{preview ? 'Private saved preview' : 'Draft appearance'}</span><div><button aria-label="Desktop preview" aria-pressed={!mobile} onClick={() => setMobile(false)}><Monitor size={18} /></button><button aria-label="Mobile preview" aria-pressed={mobile} onClick={() => setMobile(true)}><Smartphone size={18} /></button></div></div><div className={`website-preview-canvas ${mobile ? 'mobile' : ''}`}>{configuration.template==='premium-restaurant'&&!preview ? <iframe title="Restaurant live preview" srcDoc={livePreviewHtml} sandbox="allow-same-origin allow-scripts"/> : preview ? <iframe key={website?.revision} title="Private website preview" src={`${ROOT}/preview?revision=${website?.revision}`} sandbox="allow-same-origin allow-scripts" /> : <DraftVisual configuration={configuration} />}</div><p className="website-preview-note">{previewError||'Only your team can access draft previews.'}</p></aside></div>}
      {step === 2 && <section className="website-publish-panel"><div className="website-publish-icon"><Globe size={35} /></div><span className="website-eyebrow">READY WHEN YOU ARE</span><h2>{website?.status === 'published' ? 'Your doors are open online.' : 'Give your business a home.'}</h2><p>{website?.status === 'published' ? 'Keep creating. Your live website only changes when you publish again.' : 'Choose your website address and publish when everything feels right.'}</p><label className="website-field website-address"><span>Website address{data.localPaths ? ' ? /app/moon/' : ''}</span><div><input aria-label="Website address" value={subdomain} disabled={!canEdit || busy || !!website} maxLength={50} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="your-business" onChange={event => { setSubdomain(event.target.value.toLowerCase()); setNotice('') }} /><span>{data.localPaths ? '/website (local preview address)' : '.'+data.domain}</span></div><small>Your address is reserved after the first save.</small></label>{website && <dl className="website-site-details"><div><dt>Website name</dt><dd>{website.configuration.businessName}</dd></div><div><dt>Template</dt><dd>{data.templates.find(t => t.id === website.configuration.template)?.name}</dd></div><div><dt>Status</dt><dd>{website.status}{dirty || website.revision !== website.publishedRevision ? ' · unpublished changes' : ''}</dd></div><div><dt>Last published</dt><dd>{website.lastPublishedAt ? new Date(website.lastPublishedAt).toLocaleString() : 'Not yet published'}</dd></div></dl>}<div className="website-publish-actions"><button onClick={() => setStep(1)}><Paintbrush size={16} /> Edit website</button>{website?.status === 'published' && <a href={website.url} target="_blank" rel="noopener noreferrer">Visit website <ExternalLink size={16} /></a>}</div>{website?.status === 'published' && canPublish && <button className="website-unpublish" disabled={busy} onClick={() => act('unpublish')}>Unpublish website</button>}</section>}
      {step !== 0 && <div className="website-action-bar"><span>{busy ? 'Saving your changes…' : dirty ? 'You have unsaved changes' : website ? 'Your draft is saved' : 'Choose your website address to save'}</span><div>{canEdit && <button disabled={busy || (!subdomain && !website)} onClick={() => act('save')}><Save size={16} /> Save draft</button>}<button disabled={busy || ((!website || dirty) && !canEdit) || !subdomain} onClick={() => act('preview')}><Monitor size={16} /> Preview</button>{step === 1 ? <button className="website-primary" onClick={() => setStep(2)}>Continue <ArrowRight size={16} /></button> : canPublish && <button className="website-primary" disabled={busy || !subdomain || (dirty && !canEdit)} onClick={() => act('publish')}><Rocket size={16} />{website?.status === 'published' ? 'Publish changes' : 'Publish website'}</button>}</div></div>}
    </>}
  </main></div>
}
