import React, { useState, useEffect, useMemo } from 'react';
import './ExpertListView.css';
import Pagination from './Pagination'; // Import Pagination component
import type { Expert } from '../../services/expertService'; // Use type import

// Define a type for the sort configuration
type SortKey = keyof Expert | ''; // Allow empty string for no sort or make it more specific
type SortDirection = 'ascending' | 'descending';

interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

interface ExpertListViewProps {
  experts: Expert[]; // Expect experts as a prop
}

const ExpertListView: React.FC<ExpertListViewProps> = ({ experts }) => {
  const [filteredExperts, setFilteredExperts] = useState<Expert[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'pending'>('all');
  const [specializationFilter, setSpecializationFilter] = useState<string>('all');
  const [availableSpecializations, setAvailableSpecializations] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: '', direction: 'ascending' });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Remove mock data fetching useEffect
  // useEffect(() => {
  //   const mockExperts: Expert[] = [
  //     { id: '1', name: 'Dr. Alice Smith', status: 'active', specialization: 'AI Research', lastActivity: '2024-05-08' },
  //     { id: '2', name: 'Bob Johnson', status: 'inactive', specialization: 'Data Science', lastActivity: '2024-03-15' },
  //     { id: '3', name: 'Carol Williams', status: 'pending', specialization: 'Machine Learning', lastActivity: '2024-05-01' },
  //     { id: '4', name: 'David Brown', status: 'active', specialization: 'NLP', lastActivity: '2024-05-09' },
  //   ];
  //   setExperts(mockExperts); // This line would cause an error as experts is now a prop
  //   setFilteredExperts(mockExperts);
  // }, []);

  useEffect(() => {
    // Populate specializations from the passed experts prop
    if (experts) {
      const uniqueSpecializations = Array.from(new Set(experts.map(expert => expert.specialization)));
      setAvailableSpecializations(uniqueSpecializations);
      // Initialize filteredExperts with all experts when the component mounts or experts prop changes
      setFilteredExperts(experts);
    }
  }, [experts]);


  useEffect(() => {
    let tempExperts = experts || []; // Use prop experts, default to empty array if undefined

    // Filter by search term
    if (searchTerm) {
      tempExperts = tempExperts.filter(expert =>
        expert.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by status
    if (statusFilter !== 'all') {
      tempExperts = tempExperts.filter(expert => expert.status === statusFilter);
    }

    // Filter by specialization
    if (specializationFilter !== 'all') {
      tempExperts = tempExperts.filter(expert => expert.specialization === specializationFilter);
    }

    // Apply sorting
    if (sortConfig.key) {
      tempExperts.sort((a, b) => {
        // Ensure a[sortConfig.key] and b[sortConfig.key] are not undefined
        const valA = a[sortConfig.key as keyof Expert];
        const valB = b[sortConfig.key as keyof Expert];

        if (valA === undefined || valB === undefined) {
          return 0; // Or handle as per your requirement for undefined values
        }
        
        let comparison = 0;
        if (typeof valA === 'string' && typeof valB === 'string') {
          if (sortConfig.key === 'lastActivity') {
            // Date comparison
            comparison = new Date(valA).getTime() - new Date(valB).getTime();
          } else {
            // String comparison
            comparison = valA.localeCompare(valB);
          }
        } else if (typeof valA === 'number' && typeof valB === 'number') {
          // Number comparison (if any numeric fields are added later)
          comparison = valA - valB;
        }
        // Add more type checks if necessary

        return sortConfig.direction === 'ascending' ? comparison : -comparison;
      });
    }

    setFilteredExperts(tempExperts);
    // Reset to first page when filters or sort order change, but not when experts prop itself changes if not desired
    // For now, let's reset to page 1 on any of these changes for simplicity.
    setCurrentPage(1);
  }, [searchTerm, statusFilter, specializationFilter, experts, sortConfig]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (items: number) => {
    setItemsPerPage(items);
    setCurrentPage(1); // Reset to first page when items per page changes
  };

  const totalPages = useMemo(() => {
    if (!filteredExperts || filteredExperts.length === 0) return 0;
    return Math.ceil(filteredExperts.length / itemsPerPage);
  }, [filteredExperts, itemsPerPage]);

  const currentExpertsToDisplay = useMemo(() => {
    if (!filteredExperts) return [];
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredExperts.slice(startIndex, endIndex);
  }, [filteredExperts, currentPage, itemsPerPage]);

  const requestSort = (key: SortKey) => {
    if (!key) return; // Do not sort if key is empty
    let direction: SortDirection = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (columnKey: SortKey) => {
    if (sortConfig.key === columnKey) {
      return sortConfig.direction === 'ascending' ? ' ▲' : ' ▼';
    }
    return '';
  };

  return (
    <div className="expert-list-view">
      <div className="filters-container">
        <input
          type="text"
          placeholder="Search by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="filter-input"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="filter-select"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="pending">Pending</option>
        </select>
        <select
          value={specializationFilter}
          onChange={(e) => setSpecializationFilter(e.target.value)}
          className="filter-select"
        >
          <option value="all">All Specializations</option>
          {availableSpecializations.map(spec => (
            <option key={spec} value={spec}>{spec}</option>
          ))}
        </select>
      </div>

      <table className="expert-table">
        <thead>
          <tr>
            <th onClick={() => requestSort('name')}>Name{getSortIndicator('name')}</th>
            <th onClick={() => requestSort('status')}>Status{getSortIndicator('status')}</th>
            <th onClick={() => requestSort('specialization')}>Specialization{getSortIndicator('specialization')}</th>
            <th onClick={() => requestSort('lastActivity')}>Last Activity{getSortIndicator('lastActivity')}</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {currentExpertsToDisplay && currentExpertsToDisplay.length > 0 ? (
            currentExpertsToDisplay.map(expert => (
              <tr key={expert.id}>
                <td>{expert.name}</td>
                <td><span className={`status-badge status-${expert.status}`}>{expert.status}</span></td>
                <td>{expert.specialization}</td>
                <td>{new Date(expert.lastActivity).toLocaleDateString()}</td> {/* Format date */}
                <td>
                  <button className="action-button edit-button">Edit</button>
                  <button className="action-button delete-button">Delete</button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} className="no-experts-message">No experts found matching your criteria.</td>
            </tr>
          )}
        </tbody>
      </table>
      {totalPages > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={handleItemsPerPageChange}
          totalItems={filteredExperts.length}
        />
      )}
    </div>
  );
};

export default ExpertListView;