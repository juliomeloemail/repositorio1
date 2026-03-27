/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Plus, 
  MapPin, 
  Calendar, 
  Clock, 
  Trash2, 
  Plane, 
  Hotel, 
  Utensils, 
  Camera,
  X,
  PlusCircle,
  Briefcase,
  ChevronLeft,
  Edit2,
  Save,
  Search,
  ArrowLeft,
  Home,
  Sparkles,
  AlertCircle,
  GripVertical,
  ShoppingBag,
  Zap,
  Eye,
  EyeOff,
  Info,
  ExternalLink,
  Columns
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  useDraggable,
  useDroppable
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { format, addDays, parseISO, differenceInDays, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { GoogleGenAI, Type } from "@google/genai";
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix for default marker icons in Leaflet with React
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIconRetina,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// --- Types ---

interface Activity {
  id: string;
  time: string;
  description: string;
  type: 'transport' | 'hotel' | 'food' | 'activity' | 'other';
  lat?: number;
  lng?: number;
  isFree?: boolean;
  duration?: string;
  importantLinks?: string[];
  tips?: string;
  customLinks?: string;
  externalLink?: string;
}

interface Day {
  id: string;
  date: string;
  activities: Activity[];
}

interface City {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  days: Day[];
  imageUrl?: string;
  lat?: number;
  lng?: number;
}

interface Trip {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  cities: City[];
}

// --- Constants ---

const STORAGE_KEY = 'travel_itinerary_trips';

const suggestNextActivityTime = (day: Day | undefined): string => {
  if (!day || !day.activities || day.activities.length === 0) {
    const today = format(new Date(), 'yyyy-MM-dd');
    if (day?.date === today) {
      const now = new Date();
      let hours = now.getHours();
      let minutes = now.getMinutes();
      
      // Round up to next 30 mins
      if (minutes < 30) {
        minutes = 30;
      } else {
        minutes = 0;
        hours = (hours + 1) % 24;
      }
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
    return '09:00';
  }

  const sortedActivities = [...day.activities].sort((a, b) => a.time.localeCompare(b.time));
  const lastActivity = sortedActivities[sortedActivities.length - 1];
  
  const [h, m] = lastActivity.time.split(':').map(Number);
  let nextH = h + 1;
  let nextM = m;
  
  if (nextH >= 24) {
    nextH = 23;
    nextM = 59;
  }
  
  return `${nextH.toString().padStart(2, '0')}:${nextM.toString().padStart(2, '0')}`;
};

const DEFAULT_TRIPS: Trip[] = [
  {
    id: 'trip-1',
    name: 'Viagem Itália',
    startDate: '2026-06-03',
    endDate: '2026-06-15',
    cities: [
      {
        id: 'city-1',
        name: 'Lucca',
        startDate: '2026-06-03',
        endDate: '2026-06-06',
        imageUrl: 'https://picsum.photos/seed/lucca/400/300',
        lat: 43.8429,
        lng: 10.5027,
        days: [
          {
            id: 'd1',
            date: '2026-06-03',
            activities: [
              { id: 'a1', time: '11:00', description: 'Chegada no Aeroporto de Florença', type: 'transport', lat: 43.81, lng: 11.20 },
              { id: 'a2', time: '13:00', description: 'Check-in no B&B La Bella Addormentata', type: 'hotel', lat: 43.84, lng: 10.50 },
            ]
          },
          {
            id: 'd2',
            date: '2026-06-04',
            activities: [
              { id: 'a3', time: '09:00', description: 'Passeio pelas muralhas de Lucca', type: 'activity', lat: 43.8417, lng: 10.5027 },
              { id: 'a4', time: '13:00', description: 'Almoço no centro histórico', type: 'food', lat: 43.8429, lng: 10.5027 },
            ]
          },
          {
            id: 'd3',
            date: '2026-06-05',
            activities: [
              { id: 'a5', time: '10:00', description: 'Visita à Torre Guinigi', type: 'activity', lat: 43.8437, lng: 10.5063 },
            ]
          },
          {
            id: 'd4',
            date: '2026-06-06',
            activities: [
              { id: 'a6', time: '08:00', description: 'Café da manhã e partida', type: 'food', lat: 43.8429, lng: 10.5027 },
            ]
          }
        ]
      }
    ]
  }
];

// --- Icons Mapping ---

const ActivityIcon = ({ type }: { type: Activity['type'] }) => {
  switch (type) {
    case 'transport': return <Plane className="w-4 h-4" />;
    case 'hotel': return <Hotel className="w-4 h-4" />;
    case 'food': return <Utensils className="w-4 h-4" />;
    case 'activity': return <Camera className="w-4 h-4" />;
    default: return <Clock className="w-4 h-4" />;
  }
};

interface SortableActivityProps {
  activity: Activity;
  dayId: string;
  onRemove: () => void;
  onEdit: () => void;
  key?: any;
}

const SortableActivity = ({ 
  activity, 
  dayId,
  onRemove, 
  onEdit 
}: SortableActivityProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ 
    id: activity.id,
    data: { activity, dayId }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={`group bg-white p-4 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex items-center justify-between ${isDragging ? 'border-[#FF6B35] ring-2 ring-[#FF6B35]/20' : ''}`}
    >
      <div className="flex items-center gap-4">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-gray-300 hover:text-gray-400">
          <GripVertical className="w-4 h-4" />
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
          activity.type === 'transport' ? 'bg-blue-50 text-blue-600' :
          activity.type === 'hotel' ? 'bg-green-50 text-green-600' :
          activity.type === 'food' ? 'bg-orange-50 text-orange-600' :
          activity.type === 'activity' ? 'bg-purple-50 text-purple-600' :
          'bg-gray-50 text-gray-600'
        }`}>
          <ActivityIcon type={activity.type} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400">{activity.time}</span>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
              activity.type === 'transport' ? 'bg-blue-100 text-blue-700' :
              activity.type === 'hotel' ? 'bg-green-100 text-green-700' :
              activity.type === 'food' ? 'bg-orange-100 text-orange-700' :
              activity.type === 'activity' ? 'bg-purple-100 text-purple-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {activity.type === 'transport' ? 'Transporte' :
               activity.type === 'hotel' ? 'Hospedagem' :
               activity.type === 'food' ? 'Alimentação' :
               activity.type === 'activity' ? 'Atividade' : 'Outro'}
            </span>
          </div>
          <p className="font-bold text-gray-700">{activity.description}</p>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            {activity.duration && (
              <span className="flex items-center gap-1 text-[10px] text-gray-400 font-medium">
                <Clock className="w-3 h-3" />
                {activity.duration}
              </span>
            )}
            <span className="flex items-center gap-1 text-[10px] text-gray-400 font-medium">
              {activity.isFree ? (
                <span className="text-green-500 font-bold">Grátis</span>
              ) : (
                <span className="text-amber-500 font-bold">Pago</span>
              )}
            </span>
            {activity.tips && (
              <div className="relative group/tip">
                <span className="flex items-center gap-1 text-[10px] text-gray-400 font-medium italic cursor-help">
                  <Info className="w-3 h-3" />
                  Dica
                </span>
                <div className="absolute bottom-full left-0 mb-2 w-48 p-3 bg-gray-800 text-white text-[10px] rounded-xl opacity-0 group-hover/tip:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
                  {activity.tips}
                </div>
              </div>
            )}
            {(activity.importantLinks?.length || activity.customLinks || activity.externalLink) && (
              <div className="flex items-center gap-2">
                {activity.externalLink && (
                  <a 
                    href={activity.externalLink} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-purple-500 font-bold hover:underline"
                  >
                    <Info className="w-3 h-3" />
                    Detalhes
                  </a>
                )}
                {activity.importantLinks?.map((link, idx) => (
                  <a 
                    key={idx} 
                    href={link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-[#FF6B35] font-bold hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Link {idx + 1}
                  </a>
                ))}
                {activity.customLinks && (
                  <a 
                    href={activity.customLinks} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-blue-500 font-bold hover:underline"
                  >
                    <MapPin className="w-3 h-3" />
                    Mapa/Roteiro
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button 
          onClick={onEdit}
          className="opacity-0 group-hover:opacity-100 p-2 text-gray-300 hover:text-[#FF6B35] transition-all"
        >
          <Edit2 className="w-4 h-4" />
        </button>
        <button 
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 p-2 text-gray-300 hover:text-red-500 transition-all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const DraggableSuggestion = ({ suggestion }: { suggestion: Partial<Activity>, key?: any }) => {
  const id = useMemo(() => `suggestion-${crypto.randomUUID()}`, []);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { suggestion }
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: 1000,
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`p-3 bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md hover:border-[#FF6B35] transition-all cursor-grab active:cursor-grabbing group ${isDragging ? 'opacity-50 scale-95' : ''}`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs ${
          suggestion.type === 'transport' ? 'bg-blue-50 text-blue-600' :
          suggestion.type === 'hotel' ? 'bg-green-50 text-green-600' :
          suggestion.type === 'food' ? 'bg-orange-50 text-orange-600' :
          suggestion.type === 'activity' ? 'bg-purple-50 text-purple-600' :
          'bg-gray-50 text-gray-600'
        }`}>
          <ActivityIcon type={suggestion.type as any || 'activity'} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] font-bold text-gray-400">{suggestion.time || '09:00'}</span>
            <GripVertical className="w-3 h-3 text-gray-200 group-hover:text-gray-400" />
          </div>
          <p className="text-xs font-bold text-gray-700 truncate">{suggestion.description}</p>
        </div>
      </div>
    </div>
  );
};

const DroppableItinerary = ({ children, id }: { children: React.ReactNode, id: string }) => {
  const { setNodeRef, isOver } = useDroppable({ 
    id,
    data: { dayId: id }
  });
  return (
    <div ref={setNodeRef} className={`transition-all rounded-2xl ${isOver ? 'bg-[#FF6B35]/5 ring-2 ring-[#FF6B35]/20' : ''}`}>
      {children}
    </div>
  );
};

interface SortableDayColumnProps {
  day: Day;
  onAddActivity: () => void;
  onQuickAdd: (activity: Partial<Activity>) => void;
  onRemoveActivity: (dayId: string, activityId: string) => void;
  onEditActivity: (dayId: string, activity: Activity) => void;
}

const QuickAddActivity = ({ day, onAdd }: { day: Day, onAdd: (activity: Partial<Activity>) => void }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const suggestedTime = useMemo(() => suggestNextActivityTime(day), [day, isExpanded]);
  
  if (!isExpanded) {
    return (
      <button 
        onClick={() => setIsExpanded(true)}
        className="w-full py-4 border-2 border-dashed border-gray-200 text-gray-400 rounded-3xl hover:border-[#FF6B35] hover:text-[#FF6B35] hover:bg-white transition-all flex items-center justify-center gap-2 text-sm font-bold"
      >
        <Plus className="w-4 h-4" />
        Adicionar Atividade
      </button>
    );
  }

  return (
    <form 
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        onAdd({
          description: formData.get('description') as string,
          time: formData.get('time') as string,
          type: formData.get('type') as any,
          customLinks: formData.get('link') as string,
          tips: formData.get('details') as string,
        });
        setIsExpanded(false);
      }}
      className="bg-white p-5 rounded-3xl border-2 border-[#FF6B35]/20 shadow-xl space-y-4"
    >
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">Tipo</label>
          <select name="type" className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[#FF6B35]/20 appearance-none">
            <option value="activity">Atividade</option>
            <option value="transport">Transporte</option>
            <option value="hotel">Hospedagem</option>
            <option value="food">Alimentação</option>
            <option value="other">Outro</option>
          </select>
        </div>
        <div className="w-32">
          <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">Hora</label>
          <input name="time" type="time" defaultValue={suggestedTime} required className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-xs outline-none focus:ring-2 focus:ring-[#FF6B35]/20" />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">Nome</label>
        <input name="description" placeholder="Ex: Visitar Museu" required className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#FF6B35]/20" />
      </div>
      <div>
        <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">Link</label>
        <input name="link" placeholder="https://..." className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#FF6B35]/20" />
      </div>
      <div>
        <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">Detalhes</label>
        <textarea name="details" placeholder="Dicas ou observações..." rows={2} className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#FF6B35]/20 resize-none" />
      </div>
      <div className="flex gap-2 pt-2">
        <button type="submit" className="flex-1 py-3 bg-[#FF6B35] text-white text-sm font-bold rounded-xl hover:bg-[#E85D2A] transition-all shadow-lg shadow-[#FF6B35]/20">Criar</button>
        <button type="button" onClick={() => setIsExpanded(false)} className="px-6 py-3 bg-gray-100 text-gray-500 text-sm font-bold rounded-xl hover:bg-gray-200 transition-all">Cancelar</button>
      </div>
    </form>
  );
};

const ExplorarSidebar = ({ 
  selectedCity, 
  aiSearchQuery, 
  setAiSearchQuery, 
  handleAiSearch, 
  isAiSearching, 
  aiSearchResults 
}: { 
  selectedCity: City | undefined, 
  aiSearchQuery: string, 
  setAiSearchQuery: (q: string) => void, 
  handleAiSearch: (q?: string) => void, 
  isAiSearching: boolean, 
  aiSearchResults: Partial<Activity>[] 
}) => {
  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100 flex-1">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold">Explorar {selectedCity?.name}</h3>
            <p className="text-sm text-gray-400">Sugestões inteligentes da IA</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-6">
          <button 
            onClick={() => handleAiSearch('Hotéis e Hospedagem')}
            className="p-3 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold hover:bg-blue-100 transition-all flex items-center gap-2"
          >
            <Hotel className="w-4 h-4" />
            Hotéis
          </button>
          <button 
            onClick={() => handleAiSearch('Restaurantes e Gastronomia')}
            className="p-3 bg-orange-50 text-orange-600 rounded-xl text-xs font-bold hover:bg-orange-100 transition-all flex items-center gap-2"
          >
            <Utensils className="w-4 h-4" />
            Restaurantes
          </button>
          <button 
            onClick={() => handleAiSearch('Mercados locais e Artesanato')}
            className="p-3 bg-green-50 text-green-600 rounded-xl text-xs font-bold hover:bg-green-100 transition-all flex items-center gap-2"
          >
            <ShoppingBag className="w-4 h-4" />
            Mercados
          </button>
          <button 
            onClick={() => handleAiSearch('Esportes radicais e Aventura')}
            className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-bold hover:bg-red-100 transition-all flex items-center gap-2"
          >
            <Zap className="w-4 h-4" />
            Pontos Radicais
          </button>
        </div>

        <div className="flex gap-2 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input 
              type="text" 
              placeholder="O que você procura?"
              value={aiSearchQuery}
              onChange={(e) => setAiSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAiSearch(aiSearchQuery)}
              className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-purple-500 outline-none"
            />
          </div>
          <button 
            onClick={() => handleAiSearch(aiSearchQuery)}
            disabled={isAiSearching}
            className="px-6 bg-purple-600 text-white font-bold rounded-2xl hover:bg-purple-700 transition-all disabled:opacity-50"
          >
            {isAiSearching ? '...' : 'Buscar'}
          </button>
        </div>

        <button 
          onClick={() => handleAiSearch()}
          disabled={isAiSearching}
          className="w-full py-4 mb-6 border-2 border-purple-100 text-purple-600 font-bold rounded-2xl hover:bg-purple-50 transition-all flex items-center justify-center gap-2"
        >
          <Sparkles className="w-5 h-5" />
          Principais Pontos Turísticos
        </button>

        <div className="space-y-4">
          {isAiSearching ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-10 h-10 border-4 border-[#FF6B35]/20 border-t-[#FF6B35] rounded-full animate-spin" />
              <p className="text-gray-400 font-medium animate-pulse">Consultando a IA...</p>
            </div>
          ) : aiSearchResults.length > 0 ? (
            <div className="grid grid-cols-1 gap-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Arraste para o roteiro:</p>
              {aiSearchResults.map((suggestion, idx) => (
                <DraggableSuggestion key={idx} suggestion={suggestion} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Use a pesquisa acima para encontrar <br /> lugares incríveis em {selectedCity?.name}.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const SortableDayColumn: React.FC<SortableDayColumnProps> = ({ 
  day, 
  onAddActivity, 
  onQuickAdd,
  onRemoveActivity, 
  onEditActivity 
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ 
    id: day.id,
    data: { day }
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="min-w-[320px] max-w-[320px] flex flex-col gap-4">
      <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between group">
        <div className="flex items-center gap-3">
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-gray-300 hover:text-gray-400">
            <GripVertical className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-gray-700">
              {format(parseISO(day.date), "EEEE", { locale: ptBR })}
            </h3>
            <p className="text-xs text-gray-400 font-medium">
              {format(parseISO(day.date), "dd 'de' MMMM", { locale: ptBR })}
            </p>
          </div>
        </div>
        <span className="bg-gray-50 text-gray-400 text-[10px] font-black px-2 py-1 rounded-lg uppercase">
          {day.activities.length}
        </span>
      </div>
      
      <DroppableItinerary id={day.id}>
        <div className="space-y-3 min-h-[150px] p-1">
          <SortableContext 
            items={day.activities.map(a => a.id)}
            strategy={verticalListSortingStrategy}
          >
            {day.activities.map((activity) => (
              <SortableActivity 
                key={activity.id} 
                activity={activity} 
                dayId={day.id}
                onRemove={() => onRemoveActivity(day.id, activity.id)}
                onEdit={() => onEditActivity(day.id, activity)}
              />
            ))}
          </SortableContext>
          {day.activities.length === 0 && (
            <div className="h-32 border-2 border-dashed border-gray-100 rounded-3xl flex items-center justify-center text-gray-300 text-xs italic">
              Arraste algo para cá
            </div>
          )}
        </div>
      </DroppableItinerary>
      
      <QuickAddActivity day={day} onAdd={onQuickAdd} />
      
      <button 
        onClick={onAddActivity}
        className="w-full py-3 text-gray-400 hover:text-[#FF6B35] transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest"
      >
        <Plus className="w-3 h-3" />
        Mais Opções
      </button>
    </div>
  );
};

// --- Map Components ---

const MapViewUpdater = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 13);
  }, [center, map]);
  return null;
};

const CityMap = ({ city }: { city: City }) => {
  const activities = useMemo(() => {
    return city.days.flatMap(day => day.activities).filter(a => a.lat && a.lng);
  }, [city]);

  const center: [number, number] = useMemo(() => {
    if (city.lat && city.lng) return [city.lat, city.lng];
    if (activities.length > 0) return [activities[0].lat!, activities[0].lng!];
    return [0, 0]; // Default fallback
  }, [city, activities]);

  if (center[0] === 0 && center[1] === 0 && activities.length === 0) {
    return (
      <div className="h-[300px] bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400 border border-dashed border-gray-300">
        <div className="text-center">
          <MapPin className="w-8 h-8 mx-auto mb-2 opacity-20" />
          <p className="text-sm px-4">Nenhuma localização disponível para esta cidade.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[400px] w-full rounded-2xl overflow-hidden shadow-lg border border-gray-200 z-0">
      <MapContainer 
        center={center} 
        zoom={13} 
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapViewUpdater center={center} />
        {activities.map((activity) => (
          <Marker key={activity.id} position={[activity.lat!, activity.lng!]}>
            <Popup>
              <div className="p-1">
                <p className="font-bold text-[#FF6B35]">{activity.description}</p>
                <p className="text-xs text-gray-500">{activity.time}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

// --- Main App ---

export default function App() {
  // --- State ---
  const [trips, setTrips] = useState<Trip[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Fix for Lucca trip having only 1 day in previous version
      const luccaTrip = parsed.find((t: Trip) => t.id === 'trip-1');
      if (luccaTrip && luccaTrip.cities?.[0]?.id === 'city-1' && luccaTrip.cities[0].days.length === 1) {
        return DEFAULT_TRIPS;
      }
      return parsed;
    }
    return DEFAULT_TRIPS;
  });
  
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  
  // UI State
  const [showAiSearch, setShowAiSearch] = useState(false);
  const [isAddingTrip, setIsAddingTrip] = useState(false);
  const [isEditingTrip, setIsEditingTrip] = useState(false);
  const [isAddingCity, setIsAddingCity] = useState(false);
  const [isProcessingCity, setIsProcessingCity] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [isEditingCity, setIsEditingCity] = useState<City | null>(null);
  const [isAddingActivity, setIsAddingActivity] = useState<{ dayId: string } | null>(null);
  const [isEditingActivity, setIsEditingActivity] = useState<{ dayId: string, activity: Activity } | null>(null);
  const [showTripList, setShowTripList] = useState(false);
  const [showKanbanView, setShowKanbanView] = useState(false);
  
  // AI Search State
  const [aiSearchQuery, setAiSearchQuery] = useState('');
  const [aiSearchResults, setAiSearchResults] = useState<Partial<Activity>[]>([]);
  const [isAiSearching, setIsAiSearching] = useState(false);
  const [activitySuggestions, setActivitySuggestions] = useState<Partial<Activity>[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showSavePrompt, setShowSavePrompt] = useState<{ callback: () => void } | null>(null);
  const [activityFilter, setActivityFilter] = useState<Activity['type'] | 'all'>('all');
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
  }, [trips]);

  // --- Escape Key Handler ---
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Close modals/prompts first
        if (showSavePrompt) {
          setShowSavePrompt(null);
          return;
        }
        if (isAddingTrip) {
          setIsAddingTrip(false);
          return;
        }
        if (isEditingTrip) {
          setIsEditingTrip(false);
          return;
        }
        if (isAddingCity) {
          setIsAddingCity(false);
          return;
        }
        if (isEditingCity) {
          setIsEditingCity(null);
          return;
        }
        if (isAddingActivity) {
          setIsAddingActivity(null);
          return;
        }
        if (isEditingActivity) {
          setIsEditingActivity(null);
          return;
        }

        // Close overlays/sidebars
        if (showTripList) {
          setShowTripList(false);
          return;
        }
        if (showAiSearch) {
          setShowAiSearch(false);
          return;
        }

        // Navigate back in views
        if (selectedDayId) {
          checkUnsavedChanges(() => setSelectedDayId(null));
          return;
        }
        if (showKanbanView) {
          checkUnsavedChanges(() => setShowKanbanView(false));
          return;
        }
        if (selectedCityId) {
          checkUnsavedChanges(() => setSelectedCityId(null));
          return;
        }
        if (activeTripId) {
          checkUnsavedChanges(() => setActiveTripId(null));
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    showSavePrompt, isAddingTrip, isEditingTrip, isAddingCity, isEditingCity, 
    isAddingActivity, isEditingActivity, showTripList, showAiSearch, 
    selectedDayId, showKanbanView, selectedCityId, activeTripId, hasUnsavedChanges
  ]);

  // --- Derived State ---
  const activeTrip = useMemo(() => 
    trips.find(t => t.id === activeTripId), 
    [trips, activeTripId]
  );

  const selectedCity = useMemo(() => 
    activeTrip?.cities.find(c => c.id === selectedCityId), 
    [activeTrip, selectedCityId]
  );

  const selectedDay = useMemo(() => 
    selectedCity?.days.find(d => d.id === selectedDayId),
    [selectedCity, selectedDayId]
  );

  const modalDay = useMemo(() => {
    const dayId = isAddingActivity?.dayId || isEditingActivity?.dayId;
    if (!dayId || !selectedCity) return undefined;
    return selectedCity.days.find(d => d.id === dayId);
  }, [isAddingActivity, isEditingActivity, selectedCity]);

  // --- Trip Handlers ---

  const handleCreateTrip = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const start = formData.get('startDate') as string;
    const end = formData.get('endDate') as string;

    const newTrip: Trip = {
      id: crypto.randomUUID(),
      name,
      startDate: start,
      endDate: end,
      cities: []
    };

    setTrips(prev => [...prev, newTrip]);
    setActiveTripId(newTrip.id);
    setIsAddingTrip(false);
    setShowTripList(false);
  };

  const handleUpdateTrip = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const start = formData.get('startDate') as string;
    const end = formData.get('endDate') as string;

    setTrips(prev => prev.map(t => 
      t.id === activeTripId ? { ...t, name, startDate: start, endDate: end } : t
    ));
    setIsEditingTrip(false);
  };

  const deleteTrip = (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta viagem?')) return;
    const newTrips = trips.filter(t => t.id !== id);
    setTrips(newTrips);
    if (activeTripId === id) {
      setActiveTripId(newTrips[0]?.id || null);
    }
  };

  // --- City Handlers ---

  const generateDays = (start: string, end: string): Day[] => {
    const days: Day[] = [];
    const daysCount = differenceInDays(parseISO(end), parseISO(start)) + 1;
    for (let i = 0; i < daysCount; i++) {
      days.push({
        id: crypto.randomUUID(),
        date: format(addDays(parseISO(start), i), 'yyyy-MM-dd'),
        activities: []
      });
    }
    return days;
  };

  const handleAddCity = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const start = formData.get('startDate') as string;
    const end = formData.get('endDate') as string;
    const imageUrl = formData.get('imageUrl') as string;

    setIsProcessingCity(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-3-flash-preview";
      
      const days = generateDays(start, end);
      const daysCount = days.length;

      // Fetch coordinates and initial activities for the city
      const prompt = `Para a cidade de ${name}, retorne:
                      1. As coordenadas geográficas (latitude e longitude).
                      2. Um roteiro sugerido para ${daysCount} dias.
                      Retorne APENAS um JSON no formato: 
                      {
                        "lat": number, 
                        "lng": number, 
                        "itinerary": [
                          {
                            "dayIndex": number, (0 a ${daysCount - 1})
                            "activities": [
                              {
                                "description": "string", 
                                "type": "activity|food|transport|hotel", 
                                "time": "HH:MM", 
                                "lat": number, 
                                "lng": number,
                                "isFree": boolean,
                                "duration": "string (ex: 2h)",
                                "tips": "string",
                                "importantLinks": ["string"]
                              }
                            ]
                          }
                        ]
                      }`;
      
      const response = await ai.models.generateContent({
        model,
        contents: [{ parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
      });
      
      const data = JSON.parse(response.text || '{"lat": 0, "lng": 0, "itinerary": []}');

      // Populate days with suggested activities
      if (data.itinerary && Array.isArray(data.itinerary)) {
        data.itinerary.forEach((item: any) => {
          if (days[item.dayIndex]) {
            days[item.dayIndex].activities = item.activities.map((a: any) => ({
              ...a,
              id: crypto.randomUUID()
            })).sort((a: any, b: any) => a.time.localeCompare(b.time));
          }
        });
      }

      const newCity: City = {
        id: crypto.randomUUID(),
        name,
        startDate: start,
        endDate: end,
        imageUrl: imageUrl || `https://picsum.photos/seed/${name}/400/300`,
        lat: data.lat,
        lng: data.lng,
        days
      };

      setTrips(prev => prev.map(t => 
        t.id === activeTripId ? { ...t, cities: [...t.cities, newCity] } : t
      ));
      setSelectedCityId(newCity.id);
      setIsAddingCity(false);
      
      // Automatically trigger AI search for more suggestions to populate the sidebar
      setTimeout(() => {
        handleAiSearch();
      }, 500);

    } catch (error) {
      console.error('Error processing city:', error);
      // Fallback without coordinates if AI fails
      const newCity: City = {
        id: crypto.randomUUID(),
        name,
        startDate: start,
        endDate: end,
        imageUrl: imageUrl || `https://picsum.photos/seed/${name}/400/300`,
        days: generateDays(start, end)
      };
      setTrips(prev => prev.map(t => 
        t.id === activeTripId ? { ...t, cities: [...t.cities, newCity] } : t
      ));
      setSelectedCityId(newCity.id);
      setIsAddingCity(false);
    } finally {
      setIsProcessingCity(false);
    }
  };

  const handleUpdateCity = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isEditingCity || !activeTripId) return;

    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const start = formData.get('startDate') as string;
    const end = formData.get('endDate') as string;
    const imageUrl = formData.get('imageUrl') as string;

    setTrips(prev => prev.map(t => {
      if (t.id !== activeTripId) return t;
      return {
        ...t,
        cities: t.cities.map(c => {
          if (c.id !== isEditingCity.id) return c;
          
          // If dates changed, we might need to adjust days. 
          // Simple approach: if dates changed, regenerate days but try to keep activities if dates overlap.
          const oldDays = c.days;
          const newDays = generateDays(start, end);
          
          // Map old activities to new days if dates match
          const adjustedDays = newDays.map(nd => {
            const matchingOldDay = oldDays.find(od => od.date === nd.date);
            return matchingOldDay ? { ...nd, activities: matchingOldDay.activities } : nd;
          });

          return { ...c, name, startDate: start, endDate: end, imageUrl, days: adjustedDays };
        })
      };
    }));
    setIsEditingCity(null);
  };

  const deleteCity = (cityId: string) => {
    if (!confirm('Excluir esta cidade e todo o seu itinerário?')) return;
    setTrips(prev => prev.map(t => 
      t.id === activeTripId ? { ...t, cities: t.cities.filter(c => c.id !== cityId) } : t
    ));
    if (selectedCityId === cityId) setSelectedCityId(null);
  };

  // --- Activity Handlers ---

  const handleAddActivity = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isAddingActivity || !selectedCityId || !activeTripId) return;

    const formData = new FormData(e.currentTarget);
    const time = formData.get('time') as string;
    const description = formData.get('description') as string;
    const type = formData.get('type') as Activity['type'];
    const isFree = formData.get('isFree') === 'true';
    const duration = formData.get('duration') as string;
    const tips = formData.get('tips') as string;
    const customLinks = formData.get('customLinks') as string;
    const externalLink = formData.get('externalLink') as string;
    const lat = formData.get('lat') ? Number(formData.get('lat')) : undefined;
    const lng = formData.get('lng') ? Number(formData.get('lng')) : undefined;
    const importantLinks = (formData.get('importantLinks') as string)?.split(',').map(l => l.trim()).filter(Boolean);

    const newActivity: Activity = {
      id: crypto.randomUUID(),
      time,
      description,
      type,
      isFree,
      duration,
      tips,
      customLinks,
      externalLink,
      lat,
      lng,
      importantLinks
    };

    setTrips(prev => prev.map(t => {
      if (t.id !== activeTripId) return t;
      return {
        ...t,
        cities: t.cities.map(city => {
          if (city.id !== selectedCityId) return city;
          return {
            ...city,
            days: city.days.map(day => {
              if (day.id !== isAddingActivity.dayId) return day;
              return {
                ...day,
                activities: [...day.activities, newActivity].sort((a, b) => a.time.localeCompare(b.time))
              };
            })
          };
        })
      };
    }));

    setHasUnsavedChanges(true);
    setIsAddingActivity(null);
  };

  const removeActivity = (dayId: string, activityId: string) => {
    setTrips(prev => prev.map(t => {
      if (t.id !== activeTripId) return t;
      return {
        ...t,
        cities: t.cities.map(city => {
          if (city.id !== selectedCityId) return city;
          return {
            ...city,
            days: city.days.map(day => {
              if (day.id !== dayId) return day;
              return {
                ...day,
                activities: day.activities.filter(a => a.id !== activityId)
              };
            })
          };
        })
      };
    }));
    setHasUnsavedChanges(true);
  };

  const handleUpdateActivity = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isEditingActivity || !activeTripId || !selectedCityId) return;

    const formData = new FormData(e.currentTarget);
    const description = formData.get('description') as string;
    const time = formData.get('time') as string;
    const type = formData.get('type') as Activity['type'];
    const isFree = formData.get('isFree') === 'true';
    const duration = formData.get('duration') as string;
    const tips = formData.get('tips') as string;
    const customLinks = formData.get('customLinks') as string;
    const externalLink = formData.get('externalLink') as string;
    const lat = formData.get('lat') ? Number(formData.get('lat')) : undefined;
    const lng = formData.get('lng') ? Number(formData.get('lng')) : undefined;
    const importantLinks = (formData.get('importantLinks') as string)?.split(',').map(l => l.trim()).filter(Boolean);

    setTrips(prev => prev.map(t => {
      if (t.id !== activeTripId) return t;
      return {
        ...t,
        cities: t.cities.map(c => {
          if (c.id !== selectedCityId) return c;
          return {
            ...c,
            days: c.days.map(d => {
              if (d.id !== isEditingActivity.dayId) return d;
              return {
                ...d,
                activities: d.activities.map(a => 
                  a.id === isEditingActivity.activity.id ? { 
                    ...a, 
                    description, 
                    time, 
                    type,
                    isFree,
                    duration,
                    tips,
                    customLinks,
                    externalLink,
                    lat,
                    lng,
                    importantLinks
                  } : a
                ).sort((a, b) => a.time.localeCompare(b.time))
              };
            })
          };
        })
      };
    }));
    setIsEditingActivity(null);
    setHasUnsavedChanges(true);
  };

  const handleQuickAddActivity = (dayId: string, activityData: Partial<Activity>) => {
    if (!selectedCityId || !activeTripId) return;

    const newActivity: Activity = {
      id: crypto.randomUUID(),
      time: activityData.time || '09:00',
      description: activityData.description || 'Nova Atividade',
      type: activityData.type || 'activity',
      isFree: true,
      duration: '',
      tips: activityData.tips || '',
      customLinks: activityData.customLinks || '',
      importantLinks: []
    };

    setTrips(prev => prev.map(t => {
      if (t.id !== activeTripId) return t;
      return {
        ...t,
        cities: t.cities.map(city => {
          if (city.id !== selectedCityId) return city;
          return {
            ...city,
            days: city.days.map(day => {
              if (day.id !== dayId) return day;
              return {
                ...day,
                activities: [...day.activities, newActivity].sort((a, b) => a.time.localeCompare(b.time))
              };
            })
          };
        })
      };
    }));
    setHasUnsavedChanges(true);
  };

  const [activeDragData, setActiveDragData] = useState<any>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    setActiveDragData(event.active.data.current);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    setActiveDragData(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Handle day reordering
    if (activeData?.day && overData?.day) {
      const oldIndex = selectedCity.days.findIndex(d => d.id === active.id);
      const newIndex = selectedCity.days.findIndex(d => d.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const reorderedDays = arrayMove(selectedCity.days, oldIndex, newIndex);
        setTrips(prev => prev.map(t => {
          if (t.id !== activeTripId) return t;
          return {
            ...t,
            cities: t.cities.map(c => {
              if (c.id !== selectedCityId) return c;
              return { ...c, days: reorderedDays };
            })
          };
        }));
        setHasUnsavedChanges(true);
      }
      return;
    }

    // Handle suggestion drop
    if (activeData?.suggestion) {
      const suggestion = activeData.suggestion as Partial<Activity>;
      const targetDayId = overData?.dayId || (over.id as string);
      if (!targetDayId) return;

      const targetDay = selectedCity?.days.find(d => d.id === targetDayId);
      const newActivity: Activity = {
        id: crypto.randomUUID(),
        description: suggestion.description || 'Nova Atividade',
        time: suggestion.time || suggestNextActivityTime(targetDay),
        type: suggestion.type as any || 'activity',
        lat: suggestion.lat,
        lng: suggestion.lng,
        isFree: suggestion.isFree,
        duration: suggestion.duration,
        tips: suggestion.tips,
        importantLinks: suggestion.importantLinks,
        customLinks: suggestion.customLinks
      };

      setTrips(prev => prev.map(t => {
        if (t.id !== activeTripId) return t;
        return {
          ...t,
          cities: t.cities.map(c => {
            if (c.id !== selectedCityId) return c;
            return {
              ...c,
              days: c.days.map(d => {
                if (d.id !== targetDayId) return d;
                return { 
                  ...d, 
                  activities: [...d.activities, newActivity].sort((a, b) => a.time.localeCompare(b.time)) 
                };
              })
            };
          })
        };
      }));
      setHasUnsavedChanges(true);
      return;
    }

    // Handle activity move
    if (activeData?.activity) {
      const sourceDayId = activeData.dayId;
      const targetDayId = overData?.dayId || (over.id as string);

      if (!sourceDayId || !targetDayId) return;

      setTrips(prev => prev.map(t => {
        if (t.id !== activeTripId) return t;
        return {
          ...t,
          cities: t.cities.map(c => {
            if (c.id !== selectedCityId) return c;

            const sourceDay = c.days.find(d => d.id === sourceDayId);
            const targetDay = c.days.find(d => d.id === targetDayId);

            if (!sourceDay || !targetDay) return c;

            const activeActivity = sourceDay.activities.find(a => a.id === active.id);
            if (!activeActivity) return c;

            let newDays = [...c.days];

            if (sourceDayId === targetDayId) {
              // Sorting within the same day
              const oldIndex = sourceDay.activities.findIndex(a => a.id === active.id);
              const newIndex = sourceDay.activities.findIndex(a => a.id === over.id);
              if (oldIndex !== -1 && newIndex !== -1) {
                const reordered = arrayMove(sourceDay.activities, oldIndex, newIndex);
                newDays = newDays.map(d => d.id === sourceDayId ? { ...d, activities: reordered } : d);
              }
            } else {
              // Moving between days
              newDays = newDays.map(d => {
                if (d.id === sourceDayId) {
                  return { ...d, activities: d.activities.filter(a => a.id !== active.id) };
                }
                if (d.id === targetDayId) {
                  const overIndex = d.activities.findIndex(a => a.id === over.id);
                  const newActivities = [...d.activities];
                  if (overIndex !== -1) {
                    newActivities.splice(overIndex, 0, activeActivity);
                  } else {
                    newActivities.push(activeActivity);
                  }
                  return { 
                    ...d, 
                    activities: newActivities.sort((a, b) => a.time.localeCompare(b.time)) 
                  };
                }
                return d;
              });
            }

            return { ...c, days: newDays };
          })
        };
      }));
      setHasUnsavedChanges(true);
    }
  };

  const fetchSuggestions = async (query: string) => {
    if (!query || query.length < 3 || !selectedCity) {
      setActivitySuggestions([]);
      return;
    }

    setIsSuggesting(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Sugira 5 atividades curtas para um viajante em ${selectedCity.name} baseadas no termo: "${query}". 
        Retorne APENAS um JSON no formato: [{"description": "string", "type": "activity|food|transport|hotel", "time": "HH:MM", "isFree": boolean, "duration": "string", "tips": "string", "importantLinks": ["string"]}]`,
        config: { responseMimeType: "application/json" }
      });

      const suggestions = JSON.parse(response.text || '[]');
      setActivitySuggestions(suggestions);
    } catch (error) {
      console.error("Erro ao buscar sugestões:", error);
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleSaveDay = () => {
    setHasUnsavedChanges(false);
  };

  const checkUnsavedChanges = (callback: () => void) => {
    if (hasUnsavedChanges) {
      setShowSavePrompt({ callback });
    } else {
      callback();
    }
  };

  // --- AI Search Handler ---

  const handleAiSearch = async (query?: string) => {
    if (!selectedCity) return;
    setIsAiSearching(true);
    setAiSearchResults([]);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-3-flash-preview";
      const prompt = query 
        ? `Liste 6 pontos turísticos e atividades interessantes em ${selectedCity.name} relacionados a: ${query}. 
           Retorne APENAS um JSON no formato: [{"description": "string", "type": "activity|food|transport|hotel", "time": "HH:MM", "lat": number, "lng": number, "isFree": boolean, "duration": "string", "tips": "string", "importantLinks": ["string"]}]`
        : `Liste os 6 principais pontos turísticos imperdíveis em ${selectedCity.name}. 
           Retorne APENAS um JSON no formato: [{"description": "string", "type": "activity|food|transport|hotel", "time": "HH:MM", "lat": number, "lng": number, "isFree": boolean, "duration": "string", "tips": "string", "importantLinks": ["string"]}]`;
      
      const response = await ai.models.generateContent({
        model,
        contents: [{ parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
      });
      
      const results = JSON.parse(response.text || '[]');
      setAiSearchResults(results);
    } catch (error) {
      console.error('AI Search error:', error);
      setAiSearchResults([]);
    } finally {
      setIsAiSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans pb-20">
      {/* Sidebar for Trip List */}
      <AnimatePresence>
        {showTripList && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTripList(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              className="fixed top-0 left-0 h-full w-80 bg-white shadow-2xl z-[70] p-6 flex flex-col"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-[#FF6B35]" />
                  Minhas Viagens
                </h2>
                <button onClick={() => setShowTripList(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 no-scrollbar">
                {trips.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <Briefcase className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">Nenhuma viagem salva</p>
                  </div>
                ) : (
                  trips.map(t => (
                    <div 
                      key={t.id}
                      className={`group relative p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                        activeTripId === t.id 
                          ? 'border-[#FF6B35] bg-[#FF6B35]/5' 
                          : 'border-gray-100 hover:border-gray-200'
                      }`}
                      onClick={() => {
                        setActiveTripId(t.id);
                        setShowTripList(false);
                      }}
                    >
                      <h3 className="font-bold pr-8 truncate">{t.name}</h3>
                      <p className="text-xs text-gray-400 mt-1">
                        {format(parseISO(t.startDate), "dd/MM/yy")} - {format(parseISO(t.endDate), "dd/MM/yy")}
                      </p>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTrip(t.id);
                        }}
                        className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 transition-opacity"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <button 
                onClick={() => setIsAddingTrip(true)}
                className="mt-6 w-full py-4 bg-[#FF6B35] text-white font-bold rounded-2xl shadow-lg shadow-[#FF6B35]/20 flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Nova Viagem
              </button>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-white border-b border-gray-200 pt-12 pb-8 px-6 text-center shadow-sm relative group">
        <div className="absolute left-6 top-12 flex gap-2">
          <button 
            onClick={() => setShowTripList(true)}
            className="p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors text-gray-500"
            title="Minhas Viagens"
          >
            <Briefcase className="w-6 h-6" />
          </button>
          <button 
            onClick={() => {
              checkUnsavedChanges(() => {
                setActiveTripId(null);
                setSelectedCityId(null);
                setSelectedDayId(null);
              });
            }}
            className="p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors text-gray-500"
            title="Início"
          >
            <Home className="w-6 h-6" />
          </button>
          {(activeTripId || selectedCityId || selectedDayId) && (
            <button 
              onClick={() => {
                checkUnsavedChanges(() => {
                  if (selectedDayId) {
                    setSelectedDayId(null);
                  } else if (selectedCityId) {
                    setSelectedCityId(null);
                  } else if (activeTripId) {
                    setActiveTripId(null);
                  }
                });
              }}
              className="p-3 bg-[#FF6B35]/10 rounded-xl hover:bg-[#FF6B35]/20 transition-colors text-[#FF6B35] flex items-center gap-2 font-bold"
              title="Voltar"
            >
              <ArrowLeft className="w-6 h-6" />
              <span className="hidden sm:inline">Voltar</span>
            </button>
          )}
        </div>

        <motion.div
          key={activeTrip?.id}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl mx-auto"
        >
          {activeTrip ? (
            <>
              <h1 className="text-4xl font-bold tracking-tight mb-2">{activeTrip.name}</h1>
              <div className="flex items-center justify-center gap-2 text-gray-500 font-medium">
                <Calendar className="w-4 h-4" />
                <span>
                  {format(parseISO(activeTrip.startDate), "dd/MM/yyyy")} a {format(parseISO(activeTrip.endDate), "dd/MM/yyyy")}
                </span>
              </div>
              <button 
                onClick={() => setIsEditingTrip(true)}
                className="mt-4 text-xs font-bold text-[#FF6B35] uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
              >
                Editar Viagem
              </button>
            </>
          ) : (
            <h1 className="text-4xl font-bold tracking-tight mb-2 text-gray-300">Nenhuma viagem selecionada</h1>
          )}
        </motion.div>
      </header>

      <main className="max-w-7xl mx-auto px-6 mt-10">
        <AnimatePresence mode="wait">
          {!activeTripId ? (
            <motion.div
              key="trip-selection"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-[#FF6B35] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[#FF6B35]/20">
                    <Briefcase className="w-6 h-6" />
                  </div>
                  <h2 className="text-3xl font-bold italic serif">Minhas Viagens</h2>
                </div>
                <button 
                  onClick={() => setIsAddingTrip(true)}
                  className="px-6 py-3 bg-[#FF6B35] text-white font-bold rounded-2xl shadow-lg shadow-[#FF6B35]/20 hover:bg-[#E85D2A] transition-all flex items-center gap-2"
                >
                  <PlusCircle className="w-5 h-5" />
                  Nova Viagem
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {trips.map(trip => (
                  <button
                    key={trip.id}
                    onClick={() => setActiveTripId(trip.id)}
                    className="p-8 bg-white rounded-[2.5rem] border-2 border-gray-100 hover:border-[#FF6B35] hover:shadow-2xl transition-all text-left group"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-[#FF6B35]/10 group-hover:text-[#FF6B35] transition-colors">
                        <Briefcase className="w-7 h-7" />
                      </div>
                      <span className="px-3 py-1 bg-gray-50 rounded-full text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        {trip.cities.length} Destinos
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800 mb-2 group-hover:text-[#FF6B35] transition-colors">{trip.name}</h3>
                    <div className="flex items-center gap-2 text-gray-400 text-sm font-medium">
                      <Calendar className="w-4 h-4" />
                      <span>{format(parseISO(trip.startDate), "dd/MM/yy")} - {format(parseISO(trip.endDate), "dd/MM/yy")}</span>
                    </div>
                  </button>
                ))}
                {trips.length === 0 && (
                  <div className="col-span-full py-20 text-center bg-white rounded-[2.5rem] border-2 border-dashed border-gray-100">
                    <p className="text-gray-400 font-medium mb-4">Você ainda não tem viagens criadas.</p>
                    <button 
                      onClick={() => setIsAddingTrip(true)}
                      className="text-[#FF6B35] font-bold hover:underline"
                    >
                      Comece criando sua primeira viagem agora!
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ) : selectedDayId && selectedDay ? (
            <DndContext 
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <motion.div
                key="day-detail"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`grid grid-cols-1 ${showAiSearch ? 'lg:grid-cols-2' : ''} gap-8`}
              >
              {/* Left Column: Itinerary */}
              <div className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100 relative">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => checkUnsavedChanges(() => setSelectedDayId(null))}
                      className="flex items-center gap-2 text-gray-500 hover:text-[#FF6B35] font-bold transition-colors"
                    >
                      <ArrowLeft className="w-5 h-5" />
                      Voltar
                    </button>
                    <button 
                      onClick={() => setShowAiSearch(!showAiSearch)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                        showAiSearch 
                          ? 'bg-purple-100 text-purple-600 hover:bg-purple-200' 
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                      title={showAiSearch ? "Ocultar Exploração" : "Mostrar Exploração"}
                    >
                      <Sparkles className="w-4 h-4" />
                      {showAiSearch ? "Ocultar IA" : "Explorar com IA"}
                    </button>
                  </div>
                  <div className="text-right">
                    <h2 className="text-2xl font-bold text-[#FF6B35]">
                      {format(parseISO(selectedDay.date), "dd 'de' MMMM", { locale: ptBR })}
                    </h2>
                    <p className="text-gray-400 font-medium capitalize">
                      {format(parseISO(selectedDay.date), "EEEE", { locale: ptBR })}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <Clock className="w-5 h-5 text-[#FF6B35]" />
                      Atividades do Dia
                    </h3>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-2">
                    {['all', 'transport', 'hotel', 'food', 'activity', 'other'].map((type) => (
                      <button
                        key={type}
                        onClick={() => setActivityFilter(type as any)}
                        className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border ${
                          activityFilter === type 
                            ? 'bg-[#FF6B35] text-white border-[#FF6B35] shadow-md shadow-[#FF6B35]/20' 
                            : 'bg-white text-gray-400 border-gray-100 hover:border-[#FF6B35] hover:text-[#FF6B35]'
                        }`}
                      >
                        {type === 'all' ? 'Todos' : 
                         type === 'transport' ? 'Transporte' :
                         type === 'hotel' ? 'Hospedagem' :
                         type === 'food' ? 'Alimentação' :
                         type === 'activity' ? 'Atividade' : 'Outro'}
                      </button>
                    ))}
                  </div>

                    <DroppableItinerary id="itinerary-drop-zone">
                      <div className="space-y-3 min-h-[200px]">
                        {(() => {
                          const filtered = selectedDay.activities.filter(a => 
                            activityFilter === 'all' || a.type === activityFilter
                          );
                          
                          if (filtered.length === 0) {
                            return (
                              <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-100">
                                <p className="text-gray-400">
                                  {activityFilter === 'all' 
                                    ? 'Nenhuma atividade planejada.' 
                                    : `Nenhuma atividade do tipo "${
                                        activityFilter === 'transport' ? 'Transporte' :
                                        activityFilter === 'hotel' ? 'Hospedagem' :
                                        activityFilter === 'food' ? 'Alimentação' :
                                        activityFilter === 'activity' ? 'Atividade' : 'Outro'
                                      }" encontrada.`}
                                </p>
                              </div>
                            );
                          }

                          return (
                            <SortableContext 
                              items={filtered.map(a => a.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              <div className="space-y-3">
                                {filtered.map((activity) => (
                                  <SortableActivity 
                                    key={activity.id} 
                                    activity={activity} 
                                    dayId={selectedDay.id}
                                    onRemove={() => removeActivity(selectedDay.id, activity.id)}
                                    onEdit={() => setIsEditingActivity({ dayId: selectedDay.id, activity })}
                                  />
                                ))}
                              </div>
                            </SortableContext>
                          );
                        })()}
                        <div className="pt-4 space-y-2">
                          <QuickAddActivity day={selectedDay} onAdd={(activity) => handleQuickAddActivity(selectedDay.id, activity)} />
                          <button 
                            onClick={() => setIsAddingActivity({ dayId: selectedDay.id })}
                            className="w-full py-3 text-gray-400 hover:text-[#FF6B35] transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest"
                          >
                            <Plus className="w-3 h-3" />
                            Mais Opções (Modal Completo)
                          </button>
                        </div>
                      </div>
                    </DroppableItinerary>
                </div>

                <div className="mt-10 flex gap-4">
                  <button 
                    onClick={handleSaveDay}
                    className={`flex-1 py-4 font-bold rounded-2xl transition-all flex items-center justify-center gap-2 ${
                      hasUnsavedChanges 
                        ? 'bg-[#FF6B35] text-white shadow-lg shadow-[#FF6B35]/20 hover:bg-[#E85D2A]' 
                        : 'bg-green-50 text-green-600 border border-green-100'
                    }`}
                  >
                    <Save className="w-5 h-5" />
                    {hasUnsavedChanges ? 'Salvar' : 'Salvo'}
                  </button>
                  <button 
                    onClick={() => {
                      checkUnsavedChanges(() => {
                        setSelectedCityId(null);
                        setSelectedDayId(null);
                        setShowKanbanView(false);
                      });
                    }}
                    className="flex-1 py-4 border-2 border-gray-200 text-gray-500 font-bold rounded-2xl hover:border-[#FF6B35] hover:text-[#FF6B35] transition-all flex items-center justify-center gap-2"
                  >
                    <Home className="w-5 h-5" />
                    Início
                  </button>
                </div>
              </div>
              
              {/* Right Column: AI Search */}
              {showAiSearch && (
                <ExplorarSidebar 
                  selectedCity={selectedCity}
                  aiSearchQuery={aiSearchQuery}
                  setAiSearchQuery={setAiSearchQuery}
                  handleAiSearch={handleAiSearch}
                  isAiSearching={isAiSearching}
                  aiSearchResults={aiSearchResults}
                />
              )}

              <DragOverlay>
                {activeId && activeDragData ? (
                  <div className="opacity-80 scale-105 rotate-2 pointer-events-none shadow-2xl rounded-2xl bg-white p-4 border-2 border-[#FF6B35]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-[#FF6B35]/10 rounded-lg flex items-center justify-center text-[#FF6B35]">
                        {activeDragData.type === 'activity' ? <Zap className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-700 truncate max-w-[200px]">
                          {activeDragData.description || activeDragData.suggestion?.description || 'Atividade'}
                        </p>
                        <p className="text-[10px] text-gray-400 font-medium">Solte para adicionar</p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </motion.div>
          </DndContext>
          ) : selectedCityId ? (
            <DndContext 
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <motion.div
                key="day-selection"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <div className="flex items-center justify-between mb-10">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-[#FF6B35] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[#FF6B35]/20">
                      <Calendar className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-3xl font-bold italic serif">Dias em {selectedCity?.name}</h2>
                      <p className="text-gray-400 font-medium">Selecione um dia para ver o itinerário ou use a visão de colunas</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setShowKanbanView(!showKanbanView)}
                      className={`px-6 py-3 border-2 font-bold rounded-2xl transition-all flex items-center gap-2 ${
                        showKanbanView 
                          ? 'bg-[#FF6B35] border-[#FF6B35] text-white shadow-lg shadow-[#FF6B35]/20' 
                          : 'bg-white border-gray-200 text-gray-500 hover:border-[#FF6B35] hover:text-[#FF6B35]'
                      }`}
                    >
                      <Columns className="w-5 h-5" />
                      {showKanbanView ? 'Ver Cards' : 'Ver Todos os Dias'}
                    </button>
                    {!showKanbanView && (
                      <button 
                        onClick={() => setShowMap(!showMap)}
                        className="px-6 py-3 bg-white border-2 border-gray-200 text-gray-500 font-bold rounded-2xl hover:border-[#FF6B35] hover:text-[#FF6B35] transition-all flex items-center gap-2"
                      >
                        {showMap ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        {showMap ? 'Ocultar Mapa' : 'Mostrar Mapa'}
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        setSelectedCityId(null);
                        setShowKanbanView(false);
                      }}
                      className="px-6 py-3 bg-gray-100 text-gray-600 font-bold rounded-2xl hover:bg-gray-200 transition-all flex items-center gap-2"
                    >
                      <ArrowLeft className="w-5 h-5" />
                      Voltar para Cidades
                    </button>
                  </div>
                </div>

                {selectedCity && showKanbanView ? (
                  <div className="flex gap-6 overflow-x-auto pb-8 no-scrollbar min-h-[600px] items-start px-4">
                    <SortableContext 
                      items={selectedCity.days.map(d => d.id)}
                      strategy={horizontalListSortingStrategy}
                    >
                      {selectedCity.days.map((day) => (
                        <SortableDayColumn 
                          key={day.id}
                          day={day}
                          onAddActivity={() => {
                            setSelectedDayId(day.id);
                            setIsAddingActivity({ dayId: day.id });
                          }}
                          onQuickAdd={(activity) => handleQuickAddActivity(day.id, activity)}
                          onRemoveActivity={removeActivity}
                          onEditActivity={(dayId, activity) => {
                            setSelectedDayId(dayId);
                            setIsEditingActivity({ dayId, activity });
                          }}
                        />
                      ))}
                    </SortableContext>

                    {/* Explorar Sidebar in Kanban */}
                    {showAiSearch && (
                      <div className="min-w-[380px] sticky right-0 z-10">
                        <ExplorarSidebar 
                          selectedCity={selectedCity}
                          aiSearchQuery={aiSearchQuery}
                          setAiSearchQuery={setAiSearchQuery}
                          handleAiSearch={handleAiSearch}
                          isAiSearching={isAiSearching}
                          aiSearchResults={aiSearchResults}
                        />
                      </div>
                    )}
                  </div>
                ) : selectedCity && (
                  <>
                    {showMap && (
                      <div className="mb-10">
                        <CityMap city={selectedCity} />
                      </div>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                      {selectedCity.days.map((day) => (
                        <button
                          key={day.id}
                          onClick={() => setSelectedDayId(day.id)}
                          className="aspect-square bg-white rounded-[2.5rem] border-2 border-gray-100 hover:border-[#FF6B35] hover:shadow-2xl transition-all flex flex-col items-center justify-center group"
                        >
                          <span className="text-sm font-bold text-gray-400 group-hover:text-[#FF6B35] transition-colors mb-1">
                            {format(parseISO(day.date), "EEEE", { locale: ptBR })}
                          </span>
                          <span className="text-4xl font-black text-gray-700 group-hover:text-[#FF6B35] transition-colors">
                            {format(parseISO(day.date), "dd")}
                          </span>
                          <span className="mt-2 px-3 py-1 bg-gray-50 rounded-full text-[10px] font-black text-gray-300 uppercase group-hover:bg-[#FF6B35]/10 group-hover:text-[#FF6B35] transition-all">
                            {day.activities.length} Atividades
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <DragOverlay>
                  {activeId && activeDragData ? (
                    <div className="opacity-80 scale-105 rotate-2 pointer-events-none shadow-2xl rounded-2xl bg-white p-4 border-2 border-[#FF6B35]">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#FF6B35]/10 rounded-lg flex items-center justify-center text-[#FF6B35]">
                          {activeDragData.type === 'activity' ? <Zap className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-700 truncate max-w-[200px]">
                            {activeDragData.description || activeDragData.suggestion?.description || 'Atividade'}
                          </p>
                          <p className="text-[10px] text-gray-400 font-medium">Solte para adicionar</p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </DragOverlay>
              </motion.div>
            </DndContext>
          ) : (
            <motion.div
              key="city-selection"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {/* City Cards Section */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-[#FF6B35] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[#FF6B35]/20">
                    <MapPin className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold italic serif">Destinos da Viagem</h2>
                    <p className="text-gray-400 font-medium">Explore as cidades do seu roteiro</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setActiveTripId(null)}
                    className="px-6 py-3 bg-gray-100 text-gray-600 font-bold rounded-2xl hover:bg-gray-200 transition-all flex items-center gap-2"
                  >
                    <ArrowLeft className="w-5 h-5" />
                    Voltar para Viagens
                  </button>
                  <button 
                    onClick={() => setIsAddingCity(true)}
                    className="px-6 py-3 bg-white border-2 border-[#FF6B35] text-[#FF6B35] font-bold rounded-2xl hover:bg-[#FF6B35] hover:text-white transition-all flex items-center gap-2"
                  >
                    <PlusCircle className="w-5 h-5" />
                    Nova Cidade
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
                {activeTrip?.cities.map((city) => (
                  <div key={city.id} className="relative group">
                    <button
                      onClick={() => setSelectedCityId(city.id)}
                      className="w-full rounded-[2.5rem] border-2 border-gray-100 transition-all duration-500 text-left overflow-hidden bg-white hover:border-[#FF6B35] hover:shadow-2xl hover:-translate-y-2"
                    >
                      <div className="h-56 w-full relative overflow-hidden bg-gray-100">
                        {city.imageUrl ? (
                          <img 
                            src={city.imageUrl} 
                            alt={city.name} 
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300">
                            <MapPin className="w-16 h-16" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        <div className="absolute bottom-6 left-6">
                          <span className="px-4 py-1.5 bg-white/90 backdrop-blur-sm rounded-full text-xs font-black text-[#FF6B35] uppercase tracking-widest shadow-lg">
                            {differenceInDays(parseISO(city.endDate), parseISO(city.startDate)) + 1} Dias
                          </span>
                        </div>
                      </div>
                      <div className="p-8">
                        <h3 className="font-black text-2xl mb-2 truncate pr-8 text-gray-800">{city.name}</h3>
                        <div className="flex items-center gap-2 text-gray-400 font-bold text-sm">
                          <Calendar className="w-4 h-4" />
                          <span>
                            {format(parseISO(city.startDate), "dd/MM")} - {format(parseISO(city.endDate), "dd/MM")}
                          </span>
                        </div>
                      </div>
                    </button>
                    
                    <div className="absolute top-6 right-6 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0 z-10">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsEditingCity(city);
                        }}
                        className="p-3 bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100 text-gray-500 hover:text-[#FF6B35] hover:scale-110 transition-all"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteCity(city.id);
                        }}
                        className="p-3 bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100 text-gray-500 hover:text-red-500 hover:scale-110 transition-all"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
                
                {activeTrip?.cities.length === 0 && (
                  <div className="col-span-full py-20 text-center bg-white rounded-[2.5rem] border-2 border-dashed border-gray-100">
                    <p className="text-gray-400 font-medium mb-4">Nenhum destino adicionado a esta viagem.</p>
                    <button 
                      onClick={() => setIsAddingCity(true)}
                      className="text-[#FF6B35] font-bold hover:underline"
                    >
                      Adicione sua primeira cidade!
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {/* Modal: Save Confirmation Prompt */}
        {showSavePrompt && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowSavePrompt(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-8"
            >
              <div className="flex items-center gap-4 mb-6 text-amber-500">
                <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-bold text-gray-800">Alterações não salvas</h2>
              </div>
              <p className="text-gray-500 mb-8 leading-relaxed">
                Você fez alterações no itinerário deste dia que ainda não foram salvas. Deseja sair sem salvar?
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowSavePrompt(null)}
                  className="flex-1 py-4 bg-gray-100 text-gray-600 font-bold rounded-2xl hover:bg-gray-200 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    setHasUnsavedChanges(false);
                    const callback = showSavePrompt.callback;
                    setShowSavePrompt(null);
                    callback();
                  }}
                  className="flex-1 py-4 bg-[#FF6B35] text-white font-bold rounded-2xl shadow-lg shadow-[#FF6B35]/20 hover:bg-[#E85D2A] transition-all"
                >
                  Sair sem salvar
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Modal: Add/Edit Trip */}
        {(isAddingTrip || isEditingTrip) && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setIsAddingTrip(false); setIsEditingTrip(false); }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold">{isAddingTrip ? 'Nova Viagem' : 'Editar Viagem'}</h2>
                  <button onClick={() => { setIsAddingTrip(false); setIsEditingTrip(false); }} className="p-2 hover:bg-gray-100 rounded-full">
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <form onSubmit={isAddingTrip ? handleCreateTrip : handleUpdateTrip} className="space-y-6">
                  <div>
                    <label className="block text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider">Nome da Viagem</label>
                    <input name="name" defaultValue={isEditingTrip ? activeTrip?.name : ''} required className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#FF6B35] outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider">Início</label>
                      <input name="startDate" type="date" defaultValue={isEditingTrip ? activeTrip?.startDate : ''} required className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#FF6B35] outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider">Fim</label>
                      <input name="endDate" type="date" defaultValue={isEditingTrip ? activeTrip?.endDate : ''} required className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#FF6B35] outline-none" />
                    </div>
                  </div>
                  <button type="submit" className="w-full py-4 bg-[#FF6B35] text-white font-bold rounded-2xl shadow-lg shadow-[#FF6B35]/30 hover:bg-[#E85D2A] transition-all">
                    {isAddingTrip ? 'Criar Viagem' : 'Salvar Alterações'}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}

        {/* Modal: Add/Edit City */}
        {(isAddingCity || isEditingCity) && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setIsAddingCity(false); setIsEditingCity(null); }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold">{isAddingCity ? 'Nova Cidade' : 'Editar Cidade'}</h2>
                  <button onClick={() => { setIsAddingCity(false); setIsEditingCity(null); }} className="p-2 hover:bg-gray-100 rounded-full">
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <form onSubmit={isAddingCity ? handleAddCity : handleUpdateCity} className="space-y-6">
                  <div>
                    <label className="block text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider">Nome da Cidade</label>
                    <input name="name" defaultValue={isEditingCity?.name || ''} required className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#FF6B35] outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider">URL da Imagem (Opcional)</label>
                    <input name="imageUrl" defaultValue={isEditingCity?.imageUrl || ''} placeholder="https://exemplo.com/imagem.jpg" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#FF6B35] outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider">Início</label>
                      <input name="startDate" type="date" defaultValue={isEditingCity?.startDate || ''} required className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#FF6B35] outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider">Fim</label>
                      <input name="endDate" type="date" defaultValue={isEditingCity?.endDate || ''} required className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#FF6B35] outline-none" />
                    </div>
                  </div>
                  <button 
                    type="submit" 
                    disabled={isProcessingCity}
                    className={`w-full py-4 bg-[#FF6B35] text-white font-bold rounded-2xl shadow-lg shadow-[#FF6B35]/30 hover:bg-[#E85D2A] transition-all flex items-center justify-center gap-2 ${isProcessingCity ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    {isProcessingCity ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Processando...
                      </>
                    ) : (
                      isAddingCity ? 'Criar Cidade' : 'Salvar Alterações'
                    )}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}

        {/* Modal: Add/Edit Activity */}
        {(isAddingActivity || isEditingActivity) && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setIsAddingActivity(null); setIsEditingActivity(null); setActivitySuggestions([]); }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold">{isEditingActivity ? 'Editar Evento' : 'Novo Evento'}</h2>
                  <button onClick={() => { setIsAddingActivity(null); setIsEditingActivity(null); setActivitySuggestions([]); }} className="p-2 hover:bg-gray-100 rounded-full">
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <form onSubmit={isEditingActivity ? handleUpdateActivity : handleAddActivity} className="space-y-6">
                  <div className="relative">
                    <label className="block text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider">Descrição</label>
                    <input 
                      name="description" 
                      required 
                      defaultValue={isEditingActivity?.activity.description || ''}
                      placeholder="O que você vai fazer?" 
                      onChange={(e) => fetchSuggestions(e.target.value)}
                      className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#FF6B35] outline-none" 
                    />
                    
                    {/* Suggestions List */}
                    <AnimatePresence>
                      {(isSuggesting || activitySuggestions.length > 0) && (
                        <motion.div 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute z-10 left-0 right-0 mt-2 bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden"
                        >
                          {isSuggesting ? (
                            <div className="p-4 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
                              <div className="w-4 h-4 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
                              Buscando sugestões...
                            </div>
                          ) : (
                            <div className="max-h-48 overflow-y-auto no-scrollbar">
                              {activitySuggestions.map((suggestion, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => {
                                    const form = document.querySelector('form');
                                    if (form) {
                                      (form.elements.namedItem('description') as HTMLInputElement).value = suggestion.description || '';
                                      (form.elements.namedItem('type') as HTMLSelectElement).value = suggestion.type || 'activity';
                                      if (suggestion.time) {
                                        (form.elements.namedItem('time') as HTMLInputElement).value = suggestion.time;
                                      }
                                      (form.elements.namedItem('isFree') as HTMLSelectElement).value = suggestion.isFree ? 'true' : 'false';
                                      if (suggestion.duration) {
                                        (form.elements.namedItem('duration') as HTMLInputElement).value = suggestion.duration;
                                      }
                                      if (suggestion.tips) {
                                        (form.elements.namedItem('tips') as HTMLTextAreaElement).value = suggestion.tips;
                                      }
                                      if (suggestion.importantLinks) {
                                        (form.elements.namedItem('importantLinks') as HTMLInputElement).value = suggestion.importantLinks.join(', ');
                                      }
                                      if (suggestion.externalLink) {
                                        (form.elements.namedItem('externalLink') as HTMLInputElement).value = suggestion.externalLink;
                                      }
                                      if (suggestion.lat) {
                                        (form.elements.namedItem('lat') as HTMLInputElement).value = suggestion.lat.toString();
                                      }
                                      if (suggestion.lng) {
                                        (form.elements.namedItem('lng') as HTMLInputElement).value = suggestion.lng.toString();
                                      }
                                    }
                                    setActivitySuggestions([]);
                                  }}
                                  className="w-full p-4 text-left hover:bg-purple-50 transition-colors border-b border-gray-50 last:border-0 flex items-center gap-3"
                                >
                                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">
                                    <Sparkles className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <p className="font-medium text-gray-700 text-sm">{suggestion.description}</p>
                                    <p className="text-[10px] text-gray-400 uppercase font-bold">{suggestion.type}</p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider">Horário</label>
                      <input 
                        name="time" 
                        type="time" 
                        defaultValue={isEditingActivity?.activity.time || (isAddingActivity ? suggestNextActivityTime(modalDay) : '')} 
                        required 
                        className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#FF6B35] outline-none" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider">Tipo</label>
                      <select name="type" defaultValue={isEditingActivity?.activity.type || 'activity'} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#FF6B35] outline-none appearance-none">
                        <option value="activity">Atividade</option>
                        <option value="transport">Transporte</option>
                        <option value="hotel">Hospedagem</option>
                        <option value="food">Alimentação</option>
                        <option value="other">Outro</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider">Custo</label>
                      <select name="isFree" defaultValue={isEditingActivity?.activity.isFree ? 'true' : 'false'} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#FF6B35] outline-none appearance-none">
                        <option value="true">Grátis</option>
                        <option value="false">Pago</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider">Duração</label>
                      <input name="duration" placeholder="Ex: 2h" defaultValue={isEditingActivity?.activity.duration || ''} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#FF6B35] outline-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider">Dicas</label>
                    <textarea name="tips" defaultValue={isEditingActivity?.activity.tips || ''} placeholder="Dicas importantes..." className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#FF6B35] outline-none h-24 resize-none" />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider">Links Importantes (separados por vírgula)</label>
                    <input name="importantLinks" defaultValue={isEditingActivity?.activity.importantLinks?.join(', ') || ''} placeholder="https://site1.com, https://site2.com" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#FF6B35] outline-none" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider">Latitude</label>
                      <input name="lat" type="number" step="any" defaultValue={isEditingActivity?.activity.lat || ''} placeholder="Ex: -23.55" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#FF6B35] outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider">Longitude</label>
                      <input name="lng" type="number" step="any" defaultValue={isEditingActivity?.activity.lng || ''} placeholder="Ex: -46.63" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#FF6B35] outline-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider">Link de Detalhes (Externo)</label>
                    <input name="externalLink" defaultValue={isEditingActivity?.activity.externalLink || ''} placeholder="https://exemplo.com/detalhes" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#FF6B35] outline-none" />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider">Link Google Maps / Outros</label>
                    <input name="customLinks" defaultValue={isEditingActivity?.activity.customLinks || ''} placeholder="Cole aqui seu link do Google Maps ou roteiro" className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#FF6B35] outline-none" />
                  </div>
                  <button type="submit" className="w-full py-4 bg-[#FF6B35] text-white font-bold rounded-2xl shadow-lg shadow-[#FF6B35]/30 hover:bg-[#E85D2A] transition-all">
                    {isEditingActivity ? 'Salvar Alterações' : 'Adicionar ao Dia'}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
