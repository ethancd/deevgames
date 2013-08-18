require 'spec_helper'

describe "Users" do
  describe "Sign up" do

    it "finds the sign-up page" do
      visit root_url
      click_link "Sign Up"
      within "h2" do
        page.should have_content "Sign Up"
      end
    end

    it "registers" do
      visit new_user_registration_path
      expect{
        fill_in "Username", with: "veed"
        fill_in "Email", with: "veedgrape@gmail.com"
        fill_in "user_password", with: "12341234", match: :prefer_exact
        fill_in "Password confirmation", with: "12341234"
        click_button "Sign Up"
      }.to change(User, :count).by(1)


      page.should have_content "Welcome! You have signed up successfully."
    end
  end

  describe "Log in" do

    it "logs in from the front page" do
      u = FactoryGirl.create(:user)

      visit root_path

      fill_in "Email or Username", with: u.username
      fill_in "Password", with: u.password
      click_button "LOG IN"

      page.should have_content "Signed in successfully."
      page.should have_content "playing as #{u.username}"
      page.should have_selector "input.log-out"
      page.should have_selector "section.main-portal"
    end
  end

  describe "Log out" do

    it "logs out" do
      u = FactoryGirl.create(:user)

      visit root_path

      fill_in "Email or Username", with: u.username
      fill_in "Password", with: u.password
      click_button "LOG IN"

      click_button "LOG OUT"

      page.should_not have_content "playing as #{u.username}"
      page.should have_content "Sign Up"
      page.should have_content "Log In"
      page.find('input.guest')['value'].should eq "Play as Guest"
    end
  end

  describe "Guest" do

    it "signs up as guest" do
      visit root_path
      click_button "Play as Guest"
      page.should have_content "playing as guest_"
      page.should have_selector "input.log-out"
      page.should have_selector "section.main-portal"
    end
  end
end