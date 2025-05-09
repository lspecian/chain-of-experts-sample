import React, { useEffect, useState } from 'react';
import './ExpertDashboard.css';
import ExpertListView from './ExpertListView';
import { fetchExperts } from '../../services/expertService';
import type { Expert } from '../../services/expertService';

// interface ExpertDashboardProps { // Props if any - Not currently used, can be removed or adapted
// }

const ExpertDashboard: React.FC/*<ExpertDashboardProps>*/ = () => { // Props removed for now
  const [experts, setExperts] = useState<Expert[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadExperts = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const fetchedExperts = await fetchExperts();
        setExperts(fetchedExperts);
      } catch (err) {
        console.error("Failed to fetch experts:", err);
        setError("Failed to load experts. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    loadExperts();
  }, []);

  // Calculate metrics
  const totalExperts = experts.length;
  const activeExperts = experts.filter(expert => expert.status === 'active').length;
  const inactiveExperts = experts.filter(expert => expert.status === 'inactive').length;
  // const pendingExperts = experts.filter(expert => expert.status === 'pending').length; // Uncomment if needed

  if (isLoading) {
    return <div className="expert-dashboard"><p>Loading dashboard...</p></div>;
  }

  if (error) {
    return <div className="expert-dashboard"><p style={{ color: 'red' }}>{error}</p></div>;
  }

  return (
    <div className="expert-dashboard">
      <h1>Expert Management Dashboard</h1>
      {/* <p>Welcome to the Expert Management Dashboard. Metrics and expert list will be displayed here.</p> */}
      
      <div className="dashboard-metrics">
        <div className="metric-card">
          <h2>Total Experts</h2>
          <p>{totalExperts}</p>
        </div>
        <div className="metric-card">
          <h2>Active Experts</h2>
          <p>{activeExperts}</p>
        </div>
        <div className="metric-card">
          <h2>Inactive Experts</h2>
          <p>{inactiveExperts}</p>
        </div>
        {/* Optionally, add a card for pending experts if needed */}
      </div>
      
      <div className="expert-list-container">
        <h2>Expert List</h2>
        {experts.length > 0 ? (
          <ExpertListView experts={experts} />
        ) : (
          <p>No experts found.</p>
        )}
      </div>
    </div>
  );
};

export default ExpertDashboard;