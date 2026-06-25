import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './styles/globals.css';

// Pages
import Dashboard from './pages/Dashboard';
import PurchaseDevice from './pages/PurchaseDevice';
import AddMobile from './pages/AddMobile';
import SaleMobile from './pages/SaleMobile';
import TradeInPurchase from './pages/TradeInPurchase';
import MobileHistory from './pages/MobileHistory';
import VendorLedger from './pages/VendorLedger';
import ViewStock from './pages/ViewStock';
import ViewCustomer from './pages/ViewCustomer';
import ViewSupplier from './pages/ViewSupplier';

function App() {
  const { i18n, t } = useTranslation();
  const [language, setLanguage] = useState(localStorage.getItem('language') || 'en');

  useEffect(() => {
    i18n.changeLanguage(language);
    localStorage.setItem('language', language);
    document.documentElement.dir = language === 'ur' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language, i18n]);

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'ur' : 'en');
  };

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50" dir={language === 'ur' ? 'rtl' : 'ltr'}>
        {/* Header */}
        <header className="bg-white shadow sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex justify-between items-center">
              <Link to="/" className="hover:opacity-75 transition-opacity">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">
                    {language === 'ur' ? (
                      <span className="urdu-text">{t('app.name')}</span>
                    ) : (
                      t('app.name')
                    )}
                  </h1>
                  <p className="text-gray-600 mt-1">{t('app.tagline')}</p>
                </div>
              </Link>
              <button
                onClick={toggleLanguage}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {language === 'en' ? 'اردو' : 'English'}
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/purchase-device" element={<PurchaseDevice />} />
            <Route path="/add-mobile" element={<AddMobile />} />
            <Route path="/view-stock" element={<ViewStock />} />
            <Route path="/sale-mobile" element={<SaleMobile />} />
            <Route path="/trade-in-purchase" element={<TradeInPurchase />} />
            <Route path="/mobile-history" element={<MobileHistory />} />
            <Route path="/mobile-history/:mobileId" element={<MobileHistory />} />
            <Route path="/vendor-ledger" element={<VendorLedger />} />
            <Route path="/view-customer" element={<ViewCustomer />} />
            <Route path="/view-supplier" element={<ViewSupplier />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="bg-white border-t border-gray-200 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="text-center text-gray-600">
              <p>&copy; 2024 Mobile Shop Management System. All rights reserved.</p>
            </div>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;
