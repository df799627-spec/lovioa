import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Sparkles, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { showToast } from '../../App';
import './Skills.css';

const CATEGORIES = ['general', 'image', 'video', 'writing', 'coding', 'productivity', 'design', 'data', 'marketing', 'education'];

const EMPTY_FORM = {
  name: '',
  description: '',
  instructions: '',
  category: 'general',
  tags: '',
  visibility: 'public',
  status: 'published',
};

export default function SkillCreate() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentUser, authReady } = useApp();
  const editId = searchParams.get('edit');

  const [idea, setIdea] = useState('');
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(!!editId);
  const ideaRef = useRef(null);

  useEffect(() => {
    if (!authReady) return;
    if (!currentUser) navigate('/auth');
  }, [authReady, currentUser, navigate]);

  useEffect(() => {
    if (!editId) return;
    api.getSkill(editId)
      .then(skill => {
        if (!skill) return;
        setForm({
          name: skill.name || '',
          description: skill.description || '',
          instructions: skill.instructions || '',
          category: skill.category || 'general',
          tags: (skill.tags || []).join(', '),
          visibility: skill.visibility || 'public',
          status: skill.status || 'published',
        });
      })
      .catch(() => navigate('/skills'))
      .finally(() => setLoadingDraft(false));
  }, [editId, navigate]);

  const handleGenerate = useCallback(async () => {
    if (!idea.trim() || idea.trim().length < 5) {
      ideaRef.current?.focus();
      return;
    }
    setGenerating(true);
    try {
      const lang = (localStorage.getItem('pf_lang') || document.documentElement.lang || 'en').startsWith('zh') ? 'zh' : 'en';
      const res = await api.generateSkill({ idea: idea.trim(), language: lang });
      const d = res.draft || {};
      setForm(prev => ({
        ...prev,
        name: d.name || prev.name,
        description: d.description || prev.description,
        instructions: d.instructions || prev.instructions,
        category: d.category || prev.category,
        tags: Array.isArray(d.tags) ? d.tags.join(', ') : prev.tags,
      }));
    } catch (e) {
      showToast(e.message || 'AI generation failed', 'error');
    } finally {
      setGenerating(false);
    }
  }, [idea]);

  const set = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }));

  const save = async (status) => {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      instructions: form.instructions.trim(),
      category: form.category,
      tags: form.tags.split(',').map(s => s.trim()).filter(Boolean),
      visibility: form.visibility,
      status,
    };
    if (!payload.name || payload.name.length < 2) return showToast(t('skills.create.name'), 'error');
    if (!payload.instructions || payload.instructions.length < 10) return showToast(t('skills.create.instructions'), 'error');
    setSaving(true);
    try {
      if (editId) {
        await api.updateSkill(editId, payload);
        navigate(`/skills/${editId}`);
      } else {
        const created = await api.createSkill(payload);
        navigate(`/skills/${created.slug || created.id}`);
      }
    } catch (e) {
      showToast(e.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loadingDraft) {
    return <div className="skills container" style={{ padding: '80px 24px' }}><div className="skills__card-skeleton" style={{ height: 300 }} /></div>;
  }

  return (
    <div className="skills skills__create">
      <main className="container skills__create-main">
        <Link to="/skills" className="skills__back-link"><ArrowLeft size={14} />{t('skills.detail.back')}</Link>
        <h1 className="skills__hero-title skills__create-title">{editId ? t('skills.create.editing') : t('skills.create.title')}</h1>
        <p className="skills__create-subtitle">{t('skills.create.subtitle')}</p>

        <section className="skills__idea-panel">
          <label className="skills__label" htmlFor="skill-idea">{t('skills.create.ideaLabel')}</label>
          <textarea
            id="skill-idea"
            ref={ideaRef}
            className="skills__idea-input"
            value={idea}
            onChange={e => setIdea(e.target.value)}
            placeholder={t('skills.create.ideaPlaceholder')}
            rows={3}
            disabled={generating}
          />
          <button className="skills__create-btn" onClick={handleGenerate} disabled={generating || !idea.trim()}>
            {generating ? <Loader2 size={15} className="skills__spin" /> : <Sparkles size={15} />}
            {generating ? t('skills.create.generating') : t('skills.create.generate')}
          </button>
        </section>

        <section className="skills__form">
          <div className="skills__form-row">
            <div className="skills__field">
              <label className="skills__label">{t('skills.create.name')}</label>
              <input className="skills__input" value={form.name} onChange={set('name')} placeholder={t('skills.create.namePlaceholder')} />
            </div>
            <div className="skills__field">
              <label className="skills__label">{t('skills.create.category')}</label>
              <select className="skills__input" value={form.category} onChange={set('category')}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="skills__field">
            <label className="skills__label">{t('skills.create.description')}</label>
            <textarea className="skills__input" rows={2} value={form.description} onChange={set('description')} placeholder={t('skills.create.descriptionPlaceholder')} />
          </div>

          <div className="skills__field">
            <label className="skills__label">{t('skills.create.instructions')}</label>
            <textarea className="skills__input skills__input--mono" rows={14} value={form.instructions} onChange={set('instructions')} placeholder={t('skills.create.instructionsPlaceholder')} />
          </div>

          <div className="skills__form-row">
            <div className="skills__field">
              <label className="skills__label">{t('skills.create.tags')}</label>
              <input className="skills__input" value={form.tags} onChange={set('tags')} placeholder="photo, ecommerce, enhance" />
            </div>
            <div className="skills__field">
              <label className="skills__label">{t('skills.create.visibility')}</label>
              <select className="skills__input" value={form.visibility} onChange={set('visibility')}>
                <option value="public">{t('skills.create.public')}</option>
                <option value="private">{t('skills.create.private')}</option>
              </select>
            </div>
          </div>

          <div className="skills__form-actions">
            <button className="skills__action-btn skills__action-btn--primary" onClick={() => save('published')} disabled={saving}>
              {saving ? <Loader2 size={15} className="skills__spin" /> : null}
              {editId ? t('skills.create.update') : t('skills.create.publish')}
            </button>
            {!editId && (
              <button className="skills__action-btn" onClick={() => save('draft')} disabled={saving}>
                {t('skills.create.saveDraft')}
              </button>
            )}
            <Link to="/skills" className="skills__action-btn skills__action-btn--link">{t('skills.create.cancel')}</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
