// Mobile History / Mobile Passport - Complete timeline and tracking
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import BilingualLabel from '../components/BilingualLabel';
import BilingualButton from '../components/BilingualButton';
import BilingualAlert from '../components/BilingualAlert';
import BilingualInput from '../components/BilingualInput';
import { transactionsAPI } from '../services/api';

const MobileHistory = () => {
  const navigate = useNavigate();
  const { mobileId } = useParams();
  const [searchMode, setSearchMode] = useState(!mobileId); // true = search, false = view
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState(null);

  // Load history if mobileId provided
  useEffect(() => {
    if (mobileId) {
      loadMobileHistory(mobileId);
    }
  }, [mobileId]);

  const loadMobileHistory = async (id) => {
    setLoading(true);
    setError(null);
    try {
      const res = await transactionsAPI.getMobileHistory(parseInt(id));
      if (res.success) {
        setHistory(res.data);
        setSearchMode(false);
      } else {
        setError(res.error || 'Mobile not found');
      }
    } catch (err) {
      setError(err.message || 'Error loading mobile history');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setError('Please enter search query');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await transactionsAPI.searchMobile(searchQuery);
      if (res.success) {
        setSearchResults(res.data.results || []);
        if (res.data.results.length === 0) {
          setError('No mobiles found');
        }
      } else {
        setError(res.error || 'Search failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Search View
  if (searchMode) {
    return <SearchView onSearch={handleSearch} searchQuery={searchQuery} setSearchQuery={setSearchQuery} searchResults={searchResults} loading={loading} error={error} onSelect={(id) => {
      navigate(`/mobile-history/${id}`);
      loadMobileHistory(id);
    }} />;
  }

  // Loading View
  if (loading) {
    return (
      <div className="p-6 bg-gray-50 min-h-screen">
        <div className="text-center py-12">
          <div className="spinner text-4xl inline-block mb-4"></div>
          <p className="text-gray-600">Loading mobile history...</p>
        </div>
      </div>
    );
  }

  // History View
  if (history) {
    return <HistoryView history={history} onBack={() => setSearchMode(true)} />;
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {error && <BilingualAlert en={error} ur={error} type="error" onClose={() => setError(null)} />}
      <div className="text-center py-12">
        <p className="text-gray-600">No mobile selected</p>
        <BilingualButton en="Search Mobile" ur="موبائل تلاش کریں" variant="primary" size="md" onClick={() => setSearchMode(true)} className="mt-4" />
      </div>
    </div>
  );
};

// Search View Component
const SearchView = ({ onSearch, searchQuery, setSearchQuery, searchResults, loading, error, onSelect }) => {
  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="mb-8">
        <BilingualLabel
          en="Mobile History / Passport"
          ur="موبائل کی تاریخ"
          size="2xl"
          bold={true}
          color="text-gray-900"
        />
        <p className="text-gray-600 mt-2">Search for a mobile by IMEI, Model, or Customer name</p>
      </div>

      {error && <BilingualAlert en={error} ur={error} type="error" onClose={() => {}} />}

      {/* Search Form */}
      <div className="card max-w-2xl mb-8">
        <form onSubmit={onSearch} className="space-y-4">
          <div>
            <BilingualLabel
              en="Search Mobile"
              ur="موبائل تلاش کریں"
              size="md"
              bold={true}
              className="mb-2"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Enter IMEI, Model, or Customer name..."
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
              >
                {loading ? '🔍 Searching...' : '🔍 Search'}
              </button>
            </div>
          </div>

          <p className="text-sm text-gray-600">
            💡 Examples: "352XXXXXXXXX" (IMEI) | "iPhone 13" (Model) | "Ahmed Khan" (Customer)
          </p>
        </form>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="max-w-2xl">
          <BilingualLabel
            en="Search Results"
            ur="تلاش کے نتائج"
            size="lg"
            bold={true}
            className="mb-4"
          />
          <div className="space-y-3">
            {searchResults.map((result) => (
              <div
                key={result.id}
                onClick={() => onSelect(result.id)}
                className="card cursor-pointer hover:shadow-lg hover:border-blue-500 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">📱 {result.model_name || 'Unknown Model'}</p>
                    <p className="text-sm text-gray-600">IMEI: {result.imei}</p>
                  </div>
                  <span className="text-2xl">→</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// History View Component
const HistoryView = ({ history, onBack }) => {
  const mobile = history.mobile;
  const summary = history.financial_summary;
  const timeline = history.timeline;
  const owner = history.current_owner;
  const status = history.current_status;

  // Status color
  const statusColor = status === 'SOLD' ? 'text-green-600' : status === 'IN_STOCK' ? 'text-blue-600' : 'text-orange-600';
  const statusBg = status === 'SOLD' ? 'bg-green-50' : status === 'IN_STOCK' ? 'bg-blue-50' : 'bg-orange-50';

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4"
        >
          ← Search Another Mobile
        </button>

        <BilingualLabel
          en="Mobile History / Passport"
          ur="موبائل کی تاریخ"
          size="2xl"
          bold={true}
          color="text-gray-900"
        />
      </div>

      {/* Mobile Info Card */}
      <div className={`card max-w-4xl mb-6 border-2 ${statusBg}`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-4xl">📱</span>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{mobile.brand} {mobile.model}</h2>
                <p className="text-gray-600">{mobile.storage} {mobile.color}</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <p><span className="text-gray-600">IMEI:</span> <span className="font-mono font-semibold">{mobile.imei}</span></p>
              <p><span className="text-gray-600">Condition:</span> <span className="font-semibold capitalize">{mobile.condition}</span></p>
              <p><span className="text-gray-600">PTA Status:</span> <span className="font-semibold capitalize">{mobile.pta_status}</span></p>
            </div>
          </div>

          <div>
            <div className={`p-4 rounded-lg border-2 ${statusBg}`}>
              <p className="text-sm text-gray-600 mb-1">Current Status</p>
              <p className={`text-2xl font-bold ${statusColor} mb-3`}>
                {status === 'SOLD' ? '🟢 SOLD' : status === 'IN_STOCK' ? '🔵 IN STOCK' : '🟠 TRADE-IN'}
              </p>
              {owner && (
                <div className="border-t pt-3">
                  <p className="text-xs text-gray-600 mb-1">Current Owner</p>
                  <p className="font-semibold text-gray-900">{owner.name}</p>
                  <p className="text-xs text-gray-500 capitalize">{owner.type}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 max-w-4xl">
        <div className="card bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <p className="text-sm text-gray-600 mb-1">Purchase Cost</p>
          <p className="text-3xl font-bold text-red-600">Rs. {summary.total_purchase_cost.toLocaleString()}</p>
        </div>

        <div className="card bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <p className="text-sm text-gray-600 mb-1">Earned</p>
          <p className="text-3xl font-bold text-green-600">Rs. {summary.total_sales_earned.toLocaleString()}</p>
        </div>

        <div className="card bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <p className="text-sm text-gray-600 mb-1">Profit</p>
          <p className="text-3xl font-bold text-blue-600">Rs. {summary.total_profit.toLocaleString()}</p>
        </div>
      </div>

      {/* Timeline */}
      <div className="max-w-4xl">
        <BilingualLabel
          en="Timeline / History"
          ur="ٹائم لائن"
          size="lg"
          bold={true}
          className="mb-6"
        />

        <div className="card">
          <div className="relative">
            {/* Timeline vertical line */}
            <div className="absolute left-8 top-0 bottom-0 w-1 bg-gray-300"></div>

            {/* Timeline events */}
            <div className="space-y-6">
              {timeline.map((event, idx) => (
                <TimelineEvent key={idx} event={event} isLast={idx === timeline.length - 1} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Timeline Event Component
const TimelineEvent = ({ event, isLast }) => {
  const eventColors = {
    PURCHASE: { bg: 'bg-purple-100', border: 'border-purple-300', icon: '📦' },
    SALE: { bg: 'bg-blue-100', border: 'border-blue-300', icon: '📱' },
    PAYMENT_IN: { bg: 'bg-green-100', border: 'border-green-300', icon: '💰' },
    PAYMENT_OUT: { bg: 'bg-orange-100', border: 'border-orange-300', icon: '💸' },
    TRADE_IN: { bg: 'bg-indigo-100', border: 'border-indigo-300', icon: '🔄' },
    RETURN_OUT: { bg: 'bg-red-100', border: 'border-red-300', icon: '↩️' },
  };

  const colors = eventColors[event.type] || { bg: 'bg-gray-100', border: 'border-gray-300', icon: '📌' };

  return (
    <div className="relative pl-20">
      {/* Timeline dot */}
      <div className={`absolute left-0 w-16 h-16 rounded-full ${colors.bg} border-4 ${colors.border} flex items-center justify-center text-2xl`}>
        {event.icon}
      </div>

      {/* Event card */}
      <div className={`p-4 rounded-lg border-2 ${colors.border} ${colors.bg}`}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="font-bold text-gray-900">{getEventLabel(event.type)}</p>
            <p className="text-xs text-gray-600">{new Date(event.date).toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>

        <div className="space-y-1 text-sm">
          <p>
            <span className="text-gray-600">Party:</span>
            <span className="font-semibold ml-2">{event.party_name}</span>
            <span className="text-xs text-gray-500 ml-2">({event.party_type})</span>
          </p>

          {event.amount > 0 && (
            <p>
              <span className="text-gray-600">Amount:</span>
              <span className="font-bold ml-2 text-blue-600">Rs. {event.amount.toLocaleString()}</span>
            </p>
          )}

          {event.amount_received && (
            <p>
              <span className="text-gray-600">Received:</span>
              <span className="font-semibold ml-2">Rs. {event.amount_received.toLocaleString()}</span>
            </p>
          )}

          {event.payment_method && (
            <p>
              <span className="text-gray-600">Method:</span>
              <span className="font-semibold ml-2 capitalize">{event.payment_method}</span>
            </p>
          )}

          {event.notes && (
            <p>
              <span className="text-gray-600">Notes:</span>
              <span className="ml-2 italic text-gray-700">{event.notes}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

const getEventLabel = (type) => {
  const labels = {
    PURCHASE: 'Purchase / خریداری',
    SALE: 'Sale / فروخت',
    PAYMENT_IN: 'Payment Received / رقم ملی',
    PAYMENT_OUT: 'Payment Paid / رقم دی',
    TRADE_IN: 'Trade-in / ٹریڈ ان',
    RETURN_OUT: 'Return / واپسی',
  };
  return labels[type] || 'Event';
};

export default MobileHistory;
