package com.bookingnailms.repository;

import com.bookingnailms.dto.salon.SalonSearchRequest;
import com.bookingnailms.dto.salon.SalonSummaryResponse;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManager;
import org.hibernate.SessionFactory;
import org.hibernate.cfg.Configuration;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Runs the real Hibernate query on PostgreSQL without creating or changing any database records.
 * CTE fixtures shadow all referenced tables, and the JDBC connection is read-only.
 * Enable with SEARCH_TEST_JDBC_URL / SEARCH_TEST_JDBC_USERNAME / SEARCH_TEST_JDBC_PASSWORD.
 */
@EnabledIfEnvironmentVariable(named = "SEARCH_TEST_JDBC_URL", matches = ".+")
class PublicSearchPostgresTest {
    private static HikariDataSource dataSource;
    private static SessionFactory factory;
    private static final AtomicInteger selects = new AtomicInteger();
    private EntityManager em;
    private SalonSearchRepositoryImpl repository;
    private static final LocalDate SUNDAY = LocalDate.of(2026, 10, 18);
    private static final LocalDate MONDAY = SUNDAY.plusDays(1);
    private static final LocalDateTime CUTOFF = SUNDAY.atTime(11, 1);

    @BeforeAll static void connectReadOnly() throws Exception {
        var pool = new HikariConfig();
        pool.setJdbcUrl(System.getenv("SEARCH_TEST_JDBC_URL"));
        pool.setUsername(System.getenv("SEARCH_TEST_JDBC_USERNAME"));
        pool.setPassword(System.getenv("SEARCH_TEST_JDBC_PASSWORD"));
        pool.setMaximumPoolSize(1);
        pool.setMinimumIdle(0);
        pool.setReadOnly(true);
        pool.setPoolName("public-search-readonly-fixtures");
        dataSource = new HikariDataSource(pool);
        var configuration = new Configuration();
        configuration.getProperties().put("hibernate.connection.datasource", dataSource);
        configuration.setProperty("hibernate.hbm2ddl.auto", "none");
        configuration.setProperty("hibernate.dialect", "org.hibernate.dialect.PostgreSQLDialect");
        configuration.setProperty("hibernate.temp.use_jdbc_metadata_defaults", "false");
        configuration.setPhysicalNamingStrategy(new org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy());
        configuration.setStatementInspector(sql -> {
            if (!sql.stripLeading().toLowerCase(java.util.Locale.ROOT).startsWith("select ")) {
                throw new AssertionError("Read-only search fixture must only issue SELECT queries");
            }
            selects.incrementAndGet();
            return FIXTURES + sql;
        });
        for (String entity : List.of("BookingEmail", "BookingCompletionDispute", "Booking", "NailService", "Employee",
                "Payment", "WorkingSchedule", "User", "ServiceCategory", "SalonWorkingHour", "SalonProfileChange",
                "SalonClosure", "Salon", "RevokedAccessToken", "Review", "PlatformStatement", "PlatformFeePolicy", "PlatformBillingSettings")) {
            configuration.addAnnotatedClass(Class.forName("com.bookingnailms.entity." + entity));
        }
        factory = configuration.buildSessionFactory();
    }

    @AfterAll static void disconnect() {
        if (factory != null) factory.close();
        if (dataSource != null) dataSource.close();
    }
    @BeforeEach void repository() { em = factory.createEntityManager(); repository = new SalonSearchRepositoryImpl(em); selects.set(0); }
    @AfterEach void closeEntityManager() { if (em != null) em.close(); }

    @Test void ordinarySearchRetainsMissingPinsButNeverFabricatesThemOrDistances() {
        var result = search("", "", null, null, null, null, null, "newest", 0, 20, CUTOFF);
        assertEquals(List.of(10L,9L,7L,6L,5L,4L,3L,2L,1L), ids(result));
        for (var item : result) {
            assertNull(item.getDistanceKm());
            if (List.of(5L,6L,9L).contains(item.getId())) {
                assertNull(item.getLatitude()); assertNull(item.getLongitude());
            }
        }
        assertEquals("Quận 1", java.text.Normalizer.normalize(result.getContent().get(8).getDistrict(), java.text.Normalizer.Form.NFC));
        assertEquals(2, selects.get(), "projection and count only; no per-salon entity loads");
    }

    @Test void distanceOrdersAllMatchesBeforePaginationWithStableTiesAndAccurateTotal() {
        var first = search("","",null,null,0.0,0.0,null,"distance",0,2,CUTOFF);
        var second = search("","",null,null,0.0,0.0,null,"distance",1,2,CUTOFF);
        var last = search("","",null,null,0.0,0.0,null,"distance",2,2,CUTOFF);
        assertEquals(List.of(4L,1L),ids(first)); assertEquals(List.of(3L,2L),ids(second)); assertEquals(List.of(7L,10L),ids(last));
        assertEquals(6, first.getTotalElements()); assertEquals(3,first.getTotalPages()); assertTrue(last.isLast());
        assertEquals(0.0, first.getContent().get(0).getDistanceKm(), 0.0001);
        assertEquals(1.11195, second.getContent().get(0).getDistanceKm(), 0.0001);
        assertTrue(Double.isFinite(last.getContent().get(1).getDistanceKm()));
        assertEquals(Math.PI * 6371.0088, last.getContent().get(1).getDistanceKm(),0.001);
    }

    @Test void radiusBoundaryIsInclusiveAndFiltersTotalBeforePaging() {
        var all = search("","",null,null,0.0,0.0,null,"distance",0,20,CUTOFF);
        double boundary = all.getContent().stream().filter(s -> s.getId() == 3L).findFirst().orElseThrow().getDistanceKm();
        var result = search("","",null,null,0.0,0.0,boundary,"distance",0,20,CUTOFF);
        assertEquals(List.of(4L,1L,3L),ids(result)); assertEquals(3,result.getTotalElements());
        assertEquals(List.of(4L,1L),ids(search("","",null,null,0.0,0.0,0.000001,"distance",0,20,CUTOFF)));
    }

    @Test void activeServiceExistsDoesNotDuplicateSalonsAndInactiveServicesDoNotMatch() {
        assertEquals(List.of(5L,4L,1L),ids(search("gel","",null,null,null,null,null,"newest",0,20,CUTOFF)));
        assertEquals(List.of(1L),ids(search("alpha","",null,null,null,null,null,"newest",0,20,CUTOFF)));
        assertEquals(List.of(3L),ids(search("Hà Nội","",null,null,null,null,null,"newest",0,20,CUTOFF)));
        assertEquals(List.of(1L),ids(search("Sơn gel","",null,null,null,null,null,"newest",0,20,CUTOFF)));
    }

    @Test void locationFiltersAddressCityOrDistrictAndCombinesWithKeyword() {
        assertEquals(List.of(1L),ids(search("","Đường Hoa",null,null,null,null,null,"newest",0,20,CUTOFF)));
        assertEquals(List.of(3L),ids(search("","Hà Nội",null,null,null,null,null,"newest",0,20,CUTOFF)));
        assertTrue(search("gel","Hà Nội",null,null,null,null,null,"newest",0,20,CUTOFF).isEmpty());
    }

    @Test void userLikeCharactersAndSqlSyntaxAreLiteralBoundText() {
        for (String text : List.of("%", "_", "\\")) {
            assertEquals(List.of(7L),ids(search(text,"",null,null,null,null,null,"newest",0,20,CUTOFF)));
        }
        assertTrue(search("' OR 1=1 --","",null,null,null,null,null,"newest",0,20,CUTOFF).isEmpty());
    }

    @Test void ratingUsesReviewCountAndIdAsStableTieBreakers() {
        assertEquals(List.of(3L,2L),ids(search("","",null,null,null,null,null,"rating",0,2,CUTOFF)));
    }

    @Test void weekdayDefaultsExplicitClosedMalformedHoursAndClosureOverrideAllApply() {
        assertEquals(List.of(10L,9L,7L,5L,3L),ids(search("","",MONDAY,null,null,null,null,"newest",0,20,CUTOFF)));
        assertEquals(List.of(10L,9L,5L),ids(search("","",MONDAY,LocalTime.of(9,0),null,null,null,"newest",0,20,CUTOFF)));
        assertEquals(List.of(10L,9L,5L,3L),ids(search("","",MONDAY,LocalTime.of(10,0),null,null,null,"newest",0,20,CUTOFF)));
        assertEquals(List.of(10L,9L,5L),ids(search("","",MONDAY,LocalTime.NOON,null,null,null,"newest",0,20,CUTOFF)));
        assertTrue(search("","",MONDAY,LocalTime.of(18,0),null,null,null,"newest",0,20,CUTOFF).isEmpty());
    }

    @Test void sundayDefaultsClosedAndSavedHoursUseHalfOpenInterval() {
        LocalDate nextSunday = SUNDAY.plusWeeks(1);
        assertEquals(List.of(7L),ids(search("","",nextSunday,LocalTime.of(9,0),null,null,null,"newest",0,20,CUTOFF)));
        assertEquals(List.of(1L),ids(search("","",nextSunday,LocalTime.of(10,0),null,null,null,"newest",0,20,CUTOFF)));
        assertTrue(search("","",nextSunday,LocalTime.of(16,0),null,null,null,"newest",0,20,CUTOFF).isEmpty());
    }

    @Test void dateOnlyTodayRequiresAnIntervalAfterTheRoundedOneHourCutoff() {
        assertEquals(List.of(1L),ids(search("","",SUNDAY,null,null,null,null,"newest",0,20,CUTOFF)));
        assertTrue(search("","",SUNDAY,null,null,null,null,"newest",0,20,SUNDAY.atTime(16,0)).isEmpty());
        assertEquals(List.of(1L),ids(search("","",SUNDAY,null,null,null,null,"newest",0,20,SUNDAY.atTime(15,59))));
        assertTrue(search("","",SUNDAY,null,null,null,null,"newest",0,20,MONDAY.atTime(0,30)).isEmpty());
        assertEquals(List.of(7L),ids(search("","",MONDAY,LocalTime.of(0,30),null,null,null,"newest",0,20,MONDAY.atTime(0,30))));
    }

    @Test void exceptionalClosureOnlyOverridesItsSpecificDate() {
        assertTrue(search("Hà Nội","",MONDAY.plusDays(1),LocalTime.NOON,null,null,null,"newest",0,20,CUTOFF).isEmpty());
        assertEquals(List.of(2L),ids(search("Beta","",MONDAY.plusDays(1),LocalTime.NOON,null,null,null,"newest",0,20,CUTOFF)));
    }

    private Page<SalonSummaryResponse> search(String keyword, String location, LocalDate date, LocalTime time,
            Double latitude, Double longitude, Double radius, String sort, int page, int size, LocalDateTime cutoff) {
        return repository.searchPublic(new SalonSearchRequest(keyword,location,date,time,latitude,longitude,radius,sort),
                cutoff,PageRequest.of(page,size));
    }
    private List<Long> ids(Page<SalonSummaryResponse> page) { return page.stream().map(SalonSummaryResponse::getId).toList(); }

    private static final String FIXTURES = java.text.Normalizer.normalize("""
        with salons(id,name,address,city,district,logo_url,average_rating,total_reviews,latitude,longitude,status) as (values
          (1::bigint,'Alpha','1 Đường Hoa','HCM','Quận 1',null::text,4.0::numeric,20,0::float8,0::float8,'ACTIVE'),
          (2,'Beta','2 Road','HCM','Quận 1',null,5.0,3,0,0.02,'ACTIVE'),
          (3,'Gamma','3 Road','Hà Nội','Quận 2',null,5.0,9,0,0.01,'ACTIVE'),
          (4,'Delta','4 Road','HCM','Quận 1',null,3.0,1,0,0,'ACTIVE'),
          (5,'Epsilon','5 Road','HCM','Quận 1',null,4.5,4,null,null,'ACTIVE'),
          (6,'Zeta','6 Road','HCM','Quận 1',null,0.0,0,91,0,'ACTIVE'),
          (7,'100%_Nail\\Studio','7 Road','HCM','Quận 1',null,0.0,0,0,0.03,'ACTIVE'),
          (8,'Hidden','8 Road','HCM','Quận 1',null,5.0,100,0,0.001,'PENDING_APPROVAL'),
          (9,'Iota','9 Road','HCM','Quận 1',null,0.0,0,'NaN'::float8,0,'ACTIVE'),
          (10,'Kappa','10 Road','HCM','Quận 1',null,0.0,0,0,180,'ACTIVE')
        ), nail_services(id,salon_id,name,active) as (values
          (1::bigint,1::bigint,'Sơn gel',true),(2,1,'Gel repeated',true),(3,2,'Cuticle',true),
          (4,3,'Gel',false),(5,4,'Gel',true),(6,5,'Gel',true),(7,8,'Gel',true)
        ), salon_working_hours(id,salon_id,day_of_week,open_time,close_time,closed) as (values
          (1::bigint,1::bigint,'MONDAY','09:00'::time,'19:00'::time,false),
          (2,2,'MONDAY',null,null,true),(3,3,'MONDAY','10:00','12:00',false),
          (4,4,'MONDAY','15:00','14:00',false),(5,6,'MONDAY','09:00',null,false),
          (6,7,'MONDAY','00:00','01:00',false),(7,1,'SUNDAY','10:00','16:00',false),
          (8,4,'SUNDAY',null,null,true),(9,7,'SUNDAY','09:00','10:00',false)
        ), salon_closures(id,salon_id,closed_date) as (values
          (1::bigint,1::bigint,'2026-10-19'::date),(2,3,'2026-10-20'::date)
        )
        """, java.text.Normalizer.Form.NFD);
}
