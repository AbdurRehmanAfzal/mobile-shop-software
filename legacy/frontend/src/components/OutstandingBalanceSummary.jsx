// Outstanding Balance Summary - Display vendor debt overview on dashboard
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import BilingualLabel from './BilingualLabel';
import { suppliesAPI } from '../services/api';

const OutstandingBalanceSummary = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadOutstandingSummary();
  }, []);

  const loadOutstandingSummary = async () => {
    try {
      setLoading(true);
      const result = await suppliesAPI.getOutstandingSummary();
      if (result.success) {
        setSummary(result.data);
        setError(null);
      } else {
        setError(result.error || 'Failed to load outstanding balances');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <p className="text-gray-500 text-center py-4">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card border-l-4 border-red-500 bg-red-50">
        <p className="text-red-700 text-sm">{error}</p>
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  return (
    <div className="card">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold text-gray-900">
          <span className="en">Outstanding Balance</span>
          <span className="ur">باقی رقم کا خلاصہ</span>
        </h3>
        <button
          onClick={() => navigate('/vendor-ledger')}
          className="text-blue-600 hover:text-blue-800 font-semibold text-sm"
        >
          <span className="en">View All →</span>
          <span className="ur">سب دیکھیں →</span>
        </button>
      </div>

      {/* Total Outstanding Card */}
      {summary.total_outstanding > 0 && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded">
          <p className="text-xs text-red-700 uppercase font-semibold mb-1">
            <span className="en">Total Outstanding</span>
            <span className="ur">کل باقی رقم</span>
          </p>
          <p className="text-3xl font-bold text-red-700 ltr">
            Rs. {summary.total_outstanding.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-gray-600 mt-2">
            <span className="en">Across {summary.vendor_count} vendor{summary.vendor_count !== 1 ? 's' : ''}</span>
            <span className="ur">{summary.vendor_count} فروخت کار میں</span>
          </p>
        </div>
      )}

      {/* Top Debtors List */}
      {summary.vendors && summary.vendors.length > 0 ? (
        <div>
          <h4 className="font-semibold text-gray-900 mb-3">
            <span className="en">Top Debtors</span>
            <span className="ur">سب سے زیادہ قرض دار</span>
          </h4>
          <div className="space-y-2">
            {summary.vendors.slice(0, 5).map((vendor, index) => (
              <div
                key={vendor.vendor_id}
                className="flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition cursor-pointer"
                onClick={() => navigate('/vendor-ledger')}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 bg-red-500 text-white text-xs font-bold rounded-full">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{vendor.vendor_name}</p>
                      <p className="text-xs text-gray-500 ltr">{vendor.vendor_phone}</p>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-red-700 ltr">
                    Rs. {vendor.total_credit.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-gray-500">
                    <span className="en">{vendor.supply_count} purchase{vendor.supply_count !== 1 ? 's' : ''}</span>
                    <span className="ur">{vendor.supply_count} خریداری</span>
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* View All Link */}
          {summary.vendors.length > 5 && (
            <button
              onClick={() => navigate('/vendor-ledger')}
              className="w-full mt-4 py-2 text-blue-600 hover:text-blue-800 font-semibold text-sm border border-blue-200 rounded-lg hover:bg-blue-50"
            >
              <span className="en">View all {summary.vendors.length} vendors →</span>
              <span className="ur">تمام {summary.vendors.length} فروخت کار دیکھیں →</span>
            </button>
          )}
        </div>
      ) : (
        <div className="text-center py-6">
          <p className="text-gray-500 text-sm">
            <span className="en">All vendor balances are cleared!</span>
            <span className="ur">تمام فروخت کار کی رقوم واپس ہو گئیں!</span>
          </p>
        </div>
      )}
    </div>
  );
};

export default OutstandingBalanceSummary;
