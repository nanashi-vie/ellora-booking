package com.bookingnailms;

import com.bookingnailms.service.DatabasePingService;
import org.junit.jupiter.api.*;
import javax.sql.DataSource;
import java.sql.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DatabasePingServiceTest {
    private final DataSource source=mock(DataSource.class);
    private final Connection connection=mock(Connection.class);
    private final Statement statement=mock(Statement.class);
    private final ResultSet rows=mock(ResultSet.class);
    private final DatabasePingService service=new DatabasePingService(source);

    @BeforeEach void jdbc() throws Exception {
        when(source.getConnection()).thenReturn(connection);when(connection.createStatement()).thenReturn(statement);
        when(statement.executeQuery("SELECT 1")).thenReturn(rows);when(rows.next()).thenReturn(true);when(rows.getInt(1)).thenReturn(1);
    }
    @Test void healthyProbeUsesOnlyBoundedSelectAndClosesEveryBorrowedResource() throws Exception {
        var result=service.check();assertTrue(result.ready());assertEquals("UP",result.status());assertTrue(result.latencyMs()>=0);
        verify(statement).setQueryTimeout(3);verify(statement).executeQuery("SELECT 1");closed();
        verify(source,times(1)).getConnection();
    }
    @Test void acquisitionFailureIsDownAndDoesNotHoldTheGuardAgainstNextProbe() throws Exception {
        when(source.getConnection()).thenThrow(new SQLTransientConnectionException("private jdbc URL and password" )).thenReturn(connection);
        assertFalse(service.check().ready());verifyNoInteractions(connection,statement,rows);
        assertTrue(service.check().ready());closed();
    }
    @Test void statementCreationFailureClosesTheAlreadyBorrowedConnection() throws Exception {
        when(connection.createStatement()).thenThrow(new SQLException("private driver detail"));
        assertFalse(service.check().ready());verify(connection).close();verifyNoInteractions(statement,rows);
    }
    @Test void inabilityToApplyQueryTimeoutDoesNotRunAnUnboundedQuery() throws Exception {
        doThrow(new SQLException("timeout unsupported")).when(statement).setQueryTimeout(3);
        assertFalse(service.check().ready());verify(statement,never()).executeQuery(anyString());verify(statement).close();verify(connection).close();
    }
    @Test void queryTimeoutClosesStatementAndConnection() throws Exception {
        when(statement.executeQuery("SELECT 1")).thenThrow(new SQLTimeoutException("sensitive backend timeout"));
        assertFalse(service.check().ready());verify(statement).close();verify(connection).close();verifyNoInteractions(rows);
    }
    @Test void rowReadFailureClosesResultSetStatementAndConnection() throws Exception {
        when(rows.getInt(1)).thenThrow(new SQLException("read failed"));
        assertFalse(service.check().ready());closed();
    }
    @Test void emptyOrUnexpectedResultIsNotAFalsePositive() throws Exception {
        when(rows.next()).thenReturn(false);assertFalse(service.check().ready());verify(rows,never()).getInt(anyInt());
    }
    @Test void unexpectedValueIsDown() throws Exception {
        when(rows.getInt(1)).thenReturn(0);assertFalse(service.check().ready());closed();
    }
    @Test void closeFailureStillAttemptsAllOtherClosesAndReportsDown() throws Exception {
        doThrow(new SQLException("close failed")).when(rows).close();
        assertFalse(service.check().ready());closed();
    }
    @Test void poolRuntimeFailureIsGenericDown() throws Exception {
        when(source.getConnection()).thenThrow(new IllegalStateException("sensitive internal pool state"));
        var result=service.check();assertFalse(result.ready());assertEquals("DOWN",result.status());assertTrue(result.latencyMs()>=0);
    }
    @Test @Timeout(5)
    void concurrentProbeIsRejectedWithoutBorrowingASecondConnectionAndGuardRecovers() throws Exception {
        var entered=new CountDownLatch(1);var release=new CountDownLatch(1);var worker=Executors.newSingleThreadExecutor();
        when(statement.executeQuery("SELECT 1")).thenAnswer(call->{entered.countDown();
            if(!release.await(3,TimeUnit.SECONDS))throw new SQLTimeoutException("fixture timeout");return rows;});
        try {
            var first=worker.submit(service::check);assertTrue(entered.await(1,TimeUnit.SECONDS));
            assertFalse(service.check().ready());verify(source,times(1)).getConnection();
            release.countDown();assertTrue(first.get(1,TimeUnit.SECONDS).ready());
            assertTrue(service.check().ready());verify(source,times(2)).getConnection();
        } finally {release.countDown();worker.shutdownNow();}
    }
    private void closed() throws Exception {verify(rows).close();verify(statement).close();verify(connection).close();}
}
