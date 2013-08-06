require 'spec_helper'

describe "Posts" do
  describe "View posts" do
    visit blog_path

    page.should have_content "The Deev-elopment Blog"
    page.should have_content "posted by deev at"
    page.should have content "More..."
    page.should have content "Comments"

    page.should_not have_content "Edit this post"

    page.should have_selector "h3"
    page.should have_selector "article"
    page.should have_selector "img"
    page.should have_selector "time"

    context "admin" do
      fill_in "Email or Username", with: "deev"
      fill_in "Password", with: "12341234"
      click_button "LOG IN"

      visit blog_path

      page.should have_content "Edit this post"

      click_link "Edit this post"

      within "h3" do
        page.should have_content "Edit Post"
      end
    end

  end
end
