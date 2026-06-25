// View Customer Page - With detailed customer information and filtering
import React, { useState, useEffect } from 'react';
import BilingualLabel from '../components/BilingualLabel';
import BilingualButton from '../components/BilingualButton';
import BilingualAlert from '../components/BilingualAlert';
import Modal from '../components/Modal';
import { partiesAPI } from '../services/api';

const ViewCustomer = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Filter states
  const [filters, setFilters] = useState({
    minBalance: '',
    maxBalance: '',
    city: '',
    status: 'active', // active, inactive, all
  });

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
    id: true,
    name: true,
    phone: true,
    email: true,
    city: true,
    address: false,
    cnic: false,
    credit_balance: true,
    total_purchased: true,
    total_paid: true,
    is_active: true,
    created_at: false,
    updated_at: false,
  });

  // Load customers on mount
  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const res = await partiesAPI.getCustomers();
      if (res.success) {
        setCustomers(res.data || []);
      } else {
        setError(res.error || 'Failed to load customers');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleColumn = (columnName) => {
    setVisibleColumns((prev) => ({
      ...prev,
      [columnName]: !prev[columnName],
    }));
  };

  const resetColumns = () => {
    setVisibleColumns({
      id: true,
      name: true,
      phone: true,
      email: true,
      city: true,
      address: false,
      cnic: false,
      credit_balance: true,
      total_purchased: true,
      total_paid: true,
      is_active: true,
      created_at: false,
      updated_at: false,
    });
  };

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const resetFilters = () => {
    setFilters({
      minBalance: '',
      maxBalance: '',
      city: '',
      status: 'active',
    });
    setSearchTerm('');
  };

  // Filter customers based on search and filters
  const filteredCustomers = customers.filter((customer) => {
    // Search filter
    if (
      searchTerm &&
      !customer.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !customer.phone.includes(searchTerm)
    ) {
      return false;
    }

    // City filter
    if (filters.city && customer.city !== filters.city) {
      return false;
    }

    // Status filter
    if (filters.status === 'active' && !customer.is_active) {
      return false;
    }
    if (filters.status === 'inactive' && customer.is_active) {
      return false;
    }

    // Balance filters
    const balance = customer.credit_balance || 0;
    if (filters.minBalance && balance < parseFloat(filters.minBalance)) {
      return false;
    }
    if (filters.maxBalance && balance > parseFloat(filters.maxBalance)) {
      return false;
    }

    return true;
  });

  const uniqueCities = [...new Set(customers.map((c) => c.city).filter(Boolean))].sort();
  const totalCustomers = customers.length;
  const activeCustomers = customers.filter((c) => c.is_active).length;
  const totalCredit = customers.reduce((sum, c) => sum + (c.credit_balance || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      {/* Header */}
      <div className="mb-8">
        <BilingualLabel
          en="Customer Management"
          ur="کسٹمر مینجمنٹ"
          size="2xl"
          bold={true}
          color="text-gray-900"
        />
      </div>

      {/* Error Alert */}
      {error && (
        <BilingualAlert
          en={error}
          ur={error}
          type="error"
          onClose={() => setError(null)}
        />
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <BilingualLabel en="Total Customers" ur="کل کسٹمرز" size="sm" bold={true} className="mb-2" />
          <p className="text-3xl font-bold text-blue-600">{totalCustomers}</p>
          <p className="text-sm text-blue-600 mt-1">{activeCustomers} active</p>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <BilingualLabel en="Total Credit" ur="کل کریڈٹ" size="sm" bold={true} className="mb-2" />
          <p className="text-3xl font-bold text-green-600">Rs. {totalCredit.toLocaleString('en-PK')}</p>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <BilingualLabel en="Filtered Results" ur="فلٹر شدہ نتائج" size="sm" bold={true} className="mb-2" />
          <p className="text-3xl font-bold text-purple-600">{filteredCustomers.length}</p>
        </div>
      </div>

      {/* Column Selector */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
        <div className="flex justify-between items-center mb-4">
          <BilingualLabel
            en="Customize Columns"
            ur="کالمز کو حسب ضرورت بنائیں"
            size="lg"
            bold={true}
          />
          <button
            onClick={() => setShowColumnSelector(!showColumnSelector)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {showColumnSelector ? 'Hide' : 'Show'} Options
          </button>
        </div>

        {showColumnSelector && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
              {Object.keys(visibleColumns).map((col) => (
                <label key={col} className="flex items-center gap-2 p-2 bg-white rounded cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={visibleColumns[col]}
                    onChange={() => toggleColumn(col)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium text-gray-700 capitalize">
                    {col.replace(/_/g, ' ')}
                  </span>
                </label>
              ))}
            </div>
            <BilingualButton
              en="Reset Columns"
              ur="کالمز دوبارہ سیٹ کریں"
              variant="secondary"
              size="sm"
              onClick={resetColumns}
            />
          </div>
        )}
      </div>

      {/* Search and Filter Section */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <BilingualLabel
          en="Search & Filter"
          ur="تلاش اور فلٹر"
          size="lg"
          bold={true}
          className="mb-6"
        />

        <div className="space-y-4">
          {/* Search */}
          <div>
            <BilingualLabel en="Search" ur="تلاش" size="sm" bold={true} className="mb-2" />
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Filters Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* City Filter */}
            <div>
              <BilingualLabel en="City" ur="شہر" size="sm" bold={true} className="mb-2" />
              <select
                value={filters.city}
                onChange={(e) => handleFilterChange('city', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value="">All Cities</option>
                {uniqueCities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <BilingualLabel en="Status" ur="حالت" size="sm" bold={true} className="mb-2" />
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {/* Min Balance */}
            <div>
              <BilingualLabel en="Min Credit" ur="کم کریڈٹ" size="sm" bold={true} className="mb-2" />
              <input
                type="number"
                placeholder="Min balance..."
                value={filters.minBalance}
                onChange={(e) => handleFilterChange('minBalance', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Max Balance */}
            <div>
              <BilingualLabel en="Max Credit" ur="زیادہ کریڈٹ" size="sm" bold={true} className="mb-2" />
              <input
                type="number"
                placeholder="Max balance..."
                value={filters.maxBalance}
                onChange={(e) => handleFilterChange('maxBalance', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Reset Button */}
          <BilingualButton
            en="Reset Filters"
            ur="فلٹرز صاف کریں"
            variant="secondary"
            size="md"
            onClick={resetFilters}
          />
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {filteredCustomers.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500 text-lg">No customers found matching your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  {visibleColumns.id && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">ID</th>}
                  {visibleColumns.name && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Name</th>}
                  {visibleColumns.phone && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Phone</th>}
                  {visibleColumns.email && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Email</th>}
                  {visibleColumns.city && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">City</th>}
                  {visibleColumns.address && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Address</th>}
                  {visibleColumns.cnic && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">CNIC</th>}
                  {visibleColumns.credit_balance && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Credit</th>}
                  {visibleColumns.total_purchased && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Purchased</th>}
                  {visibleColumns.total_paid && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Paid</th>}
                  {visibleColumns.is_active && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>}
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer, index) => (
                  <tr
                    key={customer.id}
                    className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                  >
                    {visibleColumns.id && <td className="px-6 py-4 text-sm text-gray-900 font-medium">{customer.id}</td>}
                    {visibleColumns.name && <td className="px-6 py-4 text-sm text-gray-700 font-semibold">{customer.name}</td>}
                    {visibleColumns.phone && <td className="px-6 py-4 text-sm text-gray-700">{customer.phone}</td>}
                    {visibleColumns.email && <td className="px-6 py-4 text-sm text-gray-700">{customer.email || 'N/A'}</td>}
                    {visibleColumns.city && <td className="px-6 py-4 text-sm text-gray-700">{customer.city || 'N/A'}</td>}
                    {visibleColumns.address && <td className="px-6 py-4 text-sm text-gray-700">{customer.address || 'N/A'}</td>}
                    {visibleColumns.cnic && <td className="px-6 py-4 text-sm text-gray-700">{customer.cnic || 'N/A'}</td>}
                    {visibleColumns.credit_balance && (
                      <td className="px-6 py-4 text-sm font-semibold">
                        <span className={customer.credit_balance > 0 ? 'text-red-600' : 'text-green-600'}>
                          Rs. {Math.abs(customer.credit_balance || 0).toLocaleString('en-PK')}
                        </span>
                      </td>
                    )}
                    {visibleColumns.total_purchased && <td className="px-6 py-4 text-sm text-gray-700">Rs. {(customer.total_purchased || 0).toLocaleString('en-PK')}</td>}
                    {visibleColumns.total_paid && <td className="px-6 py-4 text-sm text-gray-700">Rs. {(customer.total_paid || 0).toLocaleString('en-PK')}</td>}
                    {visibleColumns.is_active && (
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                          customer.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {customer.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    )}
                    <td className="px-6 py-4 text-sm">
                      <button
                        onClick={() => setSelectedCustomer(customer)}
                        className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customer Detail Modal */}
      {selectedCustomer && (
        <Modal
          isOpen={true}
          title={selectedCustomer.name}
          subtitle="Customer Details"
          onClose={() => setSelectedCustomer(null)}
          size="lg"
        >
          <div className="space-y-6">
            {/* Contact Information */}
            <div>
              <BilingualLabel
                en="Contact Information"
                ur="رابطہ کی معلومات"
                size="md"
                bold={true}
                className="mb-4"
              />
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm text-gray-600">Phone</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedCustomer.phone}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Email</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedCustomer.email || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">WhatsApp</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedCustomer.whatsapp || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">CNIC</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedCustomer.cnic || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Address Information */}
            <div>
              <BilingualLabel
                en="Address"
                ur="پتہ"
                size="md"
                bold={true}
                className="mb-4"
              />
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm text-gray-600">City</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedCustomer.city || 'N/A'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-gray-600">Address</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedCustomer.address || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Financial Information */}
            <div>
              <BilingualLabel
                en="Financial Summary"
                ur="مالیاتی خلاصہ"
                size="md"
                bold={true}
                className="mb-4"
              />
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-600">Total Purchased</p>
                  <p className="text-2xl font-bold text-blue-900">Rs. {(selectedCustomer.total_purchased || 0).toLocaleString('en-PK')}</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-sm text-green-600">Total Paid</p>
                  <p className="text-2xl font-bold text-green-900">Rs. {(selectedCustomer.total_paid || 0).toLocaleString('en-PK')}</p>
                </div>
                <div className={`p-4 rounded-lg border-2 col-span-2 ${
                  selectedCustomer.credit_balance > 0
                    ? 'bg-red-50 border-red-200'
                    : 'bg-green-50 border-green-200'
                }`}>
                  <p className={`text-sm ${selectedCustomer.credit_balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {selectedCustomer.credit_balance > 0 ? 'Credit Due' : 'Advance Paid'}
                  </p>
                  <p className={`text-3xl font-bold ${selectedCustomer.credit_balance > 0 ? 'text-red-900' : 'text-green-900'}`}>
                    Rs. {Math.abs(selectedCustomer.credit_balance || 0).toLocaleString('en-PK')}
                  </p>
                </div>
              </div>
            </div>

            {/* Status and Dates */}
            <div>
              <BilingualLabel
                en="Account Details"
                ur="اکاؤنٹ کی تفصیلات"
                size="md"
                bold={true}
                className="mb-4"
              />
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold mt-1 ${
                    selectedCustomer.is_active
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {selectedCustomer.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Member Since</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {new Date(selectedCustomer.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Notes */}
            {selectedCustomer.notes && (
              <div>
                <BilingualLabel
                  en="Notes"
                  ur="نوٹس"
                  size="md"
                  bold={true}
                  className="mb-4"
                />
                <p className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-gray-900">
                  {selectedCustomer.notes}
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ViewCustomer;
